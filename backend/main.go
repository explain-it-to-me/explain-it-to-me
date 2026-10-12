package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"google.golang.org/genai"
)

var systemPrompt = map[string]string{
	"grade5": `You are an expert at explaining complex topics to 5th graders (ages 10-11).
Use simple words, short sentences, and relatable examples.
Use analogies children understand. Avoid jargon.
Make explanations fun, engaging, and accurate.`,

	"highschool": `Explain topics to high school students aged 14-18.
Use clear, conversational language, relevant examples, and some academic vocabulary.
Make complex concepts accessible while maintaining accuracy.`,

	"college": `Explain topics to college students with general academic knowledge.
Use appropriate academic vocabulary and provide thorough explanations.
Include nuanced details while remaining clear and organized.`,

	"expert": `Provide expert-level explanations for professionals and specialists.
Use technical terminology appropriately.
Include comprehensive analysis, relevant context, implications, and connections.`,
}

type ExplainRequest struct {
	Text  string `json:"text"`
	Level string `json:"level"`
}

type ConversationMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type FollowUpContext struct {
	OriginalText string `json:"originalText"`
	Explanation  string `json:"explanation"`
	Level        string `json:"level"`
}

type FollowUpRequest struct {
	Question string                `json:"question"`
	Context  FollowUpContext       `json:"context"`
	History  []ConversationMessage `json:"history"`
}

const geminiRequestTimeout = 180 * time.Second

func geminiContext(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(parent), geminiRequestTimeout)
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("No .env file loaded: %v", err)
	}

	if os.Getenv("GEMINI_API_KEY") == "" {
		log.Fatal("GEMINI_API_KEY is not set")
	}

	ctx := context.Background()
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSHandshakeTimeout = 60 * time.Second
	transport.ResponseHeaderTimeout = 120 * time.Second

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: os.Getenv("GEMINI_API_KEY"),
		HTTPClient: &http.Client{
			Transport: transport,
			Timeout:   180 * time.Second,
		},
	})
	if err != nil {
		log.Fatalf("Failed to initialize Gemini client: %v", err)
	}

	http.HandleFunc("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "OK",
		})
	})

	http.HandleFunc("/api/v1/explain", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		log.Printf("Request: %s %s", r.Method, r.URL.Path)

		r.Body = http.MaxBytesReader(w, r.Body, 100*1024)

		var body ExplainRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		body.Text = strings.TrimSpace(body.Text)
		if body.Text == "" {
			http.Error(w, "Text is required", http.StatusBadRequest)
			return
		}

		prompt, ok := systemPrompt[body.Level]
		if !ok {
			http.Error(
				w,
				"Invalid level. Must be one of: grade5, highschool, college, expert",
				http.StatusBadRequest,
			)
			return
		}

		input := prompt + "\n\nExplain the following text:\n" + body.Text
		geminiCtx, cancel := geminiContext(r.Context())
		defer cancel()

		result, err := client.Models.GenerateContent(
			geminiCtx,
			"gemini-3.5-flash-lite",
			genai.Text(input),
			nil,
		)

		if err != nil {
			log.Printf("Gemini API request failed: %v", err)
			http.Error(
				w,
				"Failed to generate explanation",
				http.StatusBadGateway,
			)
			return
		}

		if result == nil || result.Text() == "" {
			http.Error(
				w,
				"No explanation returned from Gemini",
				http.StatusBadGateway,
			)
			return
		}

		explanation := result.Text()

		log.Printf("Generated explanation: %s", explanation)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{
			"explanation": explanation,
		}); err != nil {
			log.Printf("Failed to encode response: %v", err)
		}
	})

	http.HandleFunc("/api/v1/follow-up", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		log.Printf("Request: %s %s", r.Method, r.URL.Path)
		r.Body = http.MaxBytesReader(w, r.Body, 200*1024)

		var body FollowUpRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		body.Question = strings.TrimSpace(body.Question)
		body.Context.OriginalText = strings.TrimSpace(body.Context.OriginalText)
		if body.Question == "" || body.Context.OriginalText == "" {
			http.Error(w, "Question and original text are required", http.StatusBadRequest)
			return
		}

		levelDescriptions := map[string]string{
			"grade5":     "a 5th grader using simple language and fun analogies",
			"highschool": "a high school student using clear, relatable language",
			"college":    "a college student using academic, structured language",
			"expert":     "an expert audience using technical, precise language",
		}
		levelDescription, ok := levelDescriptions[body.Context.Level]
		if !ok {
			http.Error(w, "Invalid level", http.StatusBadRequest)
			return
		}

		conversation := ""
		for _, message := range body.History {
			role := "Assistant"
			if message.Role == "user" {
				role = "User"
			}
			conversation += role + ": " + message.Content + "\n\n"
		}

		input := "You are a helpful AI assistant continuing a conversation about explaining text to " + levelDescription + ".\n\n" +
			"Original text being discussed: \"" + body.Context.OriginalText + "\"\n\n" +
			"Previous conversation:\n" + conversation +
			"User's new question: " + body.Question + "\n\n" +
			"Please provide a helpful, clear response that maintains the same explanation level. Keep your response focused and concise."
		geminiCtx, cancel := geminiContext(r.Context())
		defer cancel()

		result, err := client.Models.GenerateContent(
			geminiCtx,
			"gemini-3.5-flash-lite",
			genai.Text(input),
			nil,
		)
		if err != nil {
			log.Printf("Gemini follow-up request failed: %v", err)
			http.Error(w, "Failed to generate follow-up response", http.StatusBadGateway)
			return
		}

		if result == nil || result.Text() == "" {
			http.Error(w, "No response returned from Gemini", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{
			"response": result.Text(),
		}); err != nil {
			log.Printf("Failed to encode follow-up response: %v", err)
		}
	})

	log.Println("Server listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
