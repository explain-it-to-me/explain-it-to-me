# Explain It to Me - AI Text Simplifier

A beautiful Chrome extension that transforms complex web content into clear, understandable explanations using AI technology.

## Features

- **Smart Text Selection**: Highlight any text on any webpage
- **4 Intelligence Levels**: 
  - **Kid-Friendly**: Simple explanations like you're 5 years old
  - **High School**: Clear language with academic vocabulary  
  - **College**: Detailed analysis with nuanced insights
  - **Expert**: Technical terminology and comprehensive analysis
- **AI-Powered**: Uses advanced language models for intelligent explanations
- **Smart Memory**: Remembers your preferred explanation level
- **Privacy-First**: Secure and private by design
- **Beautiful UI**: Modern interface with smooth animations
- **Usage Statistics**: Track your learning journey

## Installation

1. **Download Extension**
   - Clone or download this repository
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the extension folder

2. **Add Icons** (Required)
   - Create PNG icons in the `/icons` folder:
     - `icon16.png` (16x16 pixels)
     - `icon32.png` (32x32 pixels) 
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)

3. **Configure API** (Developer Setup)
   - Open `background.js`
   - Replace `YOUR_PRECONFIGURED_API_KEY_HERE` with your actual ChatGPT API key
   - The extension is now ready to use!

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension standard)
- **Permissions**: `activeTab`, `contextMenus`, `storage`
- **AI Integration**: ChatGPT API for intelligent text processing
- **Storage**: Chrome local storage for user preferences
- **Framework**: Vanilla JavaScript with modern CSS

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with proper testing
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

MIT License - feel free to use, modify, and distribute as needed.
