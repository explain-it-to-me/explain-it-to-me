const BACKEND_API = 'http://localhost:8080/api/v1';

async function requestBackend(path, body, responseField) {
    const response = await fetch(`${BACKEND_API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Backend service unavailable.');
    }

    if (!data[responseField]) {
        throw new Error('Backend returned an empty response.');
    }

    return data[responseField];
}

/**
 * Simplifies text using the Gemini API.
 * @param {string} text - The text to simplify.
 * @param {string} level - The explanation level (grade5, highschool, college, expert).
 * @returns {Promise<string>} - The explanation.
 */
export async function simplifyText(text, level) {
    return requestBackend('/explain', { text, level }, 'explanation');
}

/**
 * Handle follow-up questions in a conversation.
 * @param {string} question - The follow-up question.
 * @param {Object} context - The original context (originalText, explanation, level).
 * @param {Array} history - Conversation history.
 * @returns {Promise<string>} - The response.
 */
export async function askFollowUp(question, context, history) {
    return requestBackend('/follow-up', { question, context, history }, 'response');
}
