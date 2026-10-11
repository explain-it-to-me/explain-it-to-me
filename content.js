const marked = window.marked;

// Enhanced content script with Shadow DOM isolation
let currentModal = null;
let isInitialized = false;
let shadowRoot = null;
let shadowHost = null;
let modalLocked = false;
let isClosing = false;
let chatPanelOpen = false;
let conversationHistory = [];
let currentContext = { originalText: '', explanation: '', level: '' };

// Initialize the content script only once
function init() {
  if (isInitialized) return;
  isInitialized = true;

  console.log('Explain It to Me content script initialized');

  // Create Shadow DOM container for isolation
  createShadowContainer();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);

  // Add escape key listener
  document.addEventListener('keydown', handleKeyDown, true);
}

// Create Shadow DOM container - this naturally isolates our modal
function createShadowContainer() {
  // Remove any existing container
  const existing = document.getElementById('explainer-shadow-host');
  if (existing) existing.remove();

  // Create shadow host element
  shadowHost = document.createElement('div');
  shadowHost.id = 'explainer-shadow-host';
  shadowHost.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  `;

  // Attach shadow DOM (closed mode for extra protection)
  shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

  // Inject styles into shadow DOM
  const styleSheet = document.createElement('style');
  styleSheet.textContent = getModalStyles();
  shadowRoot.appendChild(styleSheet);

  // Append to document
  (document.body || document.documentElement).appendChild(shadowHost);
}

// Handle keydown events
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    if (chatPanelOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeChatPanel();
    } else if (currentModal && !modalLocked) {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  }
}

// Handle messages from background script
function handleMessage(request, sender, sendResponse) {
  try {
    console.log('Received:', request.action);

    switch (request.action) {
      case 'ping':
        sendResponse({ success: true, ready: true });
        break;
      case 'showLoading':
        showLoadingModal(request.level);
        sendResponse({ success: true });
        break;
      case 'showExplanation':
        showExplanationModal(request.explanation, request.originalText, request.level);
        sendResponse({ success: true });
        break;
      case 'showError':
        showErrorModal(request.error);
        sendResponse({ success: true });
        break;
      case 'followUpResponse':
        handleFollowUpResponse(request.response);
        sendResponse({ success: true });
        break;
      case 'followUpError':
        handleFollowUpError(request.error);
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true;
}

// Show loading modal
function showLoadingModal(level) {
  removeModal();
  modalLocked = true;
  shadowHost.style.pointerEvents = 'auto';

  const modal = document.createElement('div');
  modal.className = 'explainer-modal';
  modal.innerHTML = `
    <div class="explainer-modal-content explainer-loading">
      <div class="explainer-header">
        <h3>Generating explanation
          <span class="explainer-level-badge">${getLevelName(level)}</span>
        </h3>
        <button class="explainer-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="explainer-body">
        <div class="explainer-spinner"></div>
        <p>Preparing a ${getLevelName(level).toLowerCase()} explanation<span class="explainer-loading-dots"></span></p>
      </div>
    </div>
  `;

  addModalEventListeners(modal);
  shadowRoot.appendChild(modal);
  currentModal = modal;

  requestAnimationFrame(() => {
    modal.classList.add('explainer-show');
    setTimeout(() => { modalLocked = false; }, 500);
  });
}

// Show explanation modal
function showExplanationModal(explanation, originalText, level) {
  modalLocked = false;
  
  // Store context for follow-up questions
  currentContext = { originalText, explanation, level };
  conversationHistory = [
    { role: 'user', content: `Explain this: "${originalText}"` },
    { role: 'assistant', content: explanation }
  ];

  if (currentModal) {
    // Update existing modal
    const content = currentModal.querySelector('.explainer-modal-content');
    if (content) {
      content.style.opacity = '0.7';
      setTimeout(() => {
        updateModalContent(content, explanation, originalText, level);
        content.classList.remove('explainer-loading');
        content.style.opacity = '1';
      }, 150);
    }
  } else {
    createNewExplanationModal(explanation, originalText, level);
  }
}

function updateModalContent(content, explanation, originalText, level) {
  const html = (marked && typeof marked.parse === 'function')
    ? marked.parse(explanation)
    : explanation;

  content.innerHTML = `
    <div class="explainer-header">
      <h3>Explanation
        <span class="explainer-level-badge">${getLevelName(level)}</span>
      </h3>
      <button class="explainer-close" type="button" aria-label="Close">&times;</button>
    </div>
    <div class="explainer-body">
      <div class="explainer-original">
        <h4>Original text</h4>
        <p>"${truncateText(originalText, 250)}"</p>
      </div>
      <div class="explainer-explanation">
        <h4>${getLevelName(level)} explanation</h4>
        <div class="explainer-content">${html}</div>
      </div>
    </div>
    <div class="explainer-footer">
      <button class="explainer-btn explainer-btn-chat explainer-followup-btn" type="button">
        Ask a follow-up
      </button>
      <div class="explainer-footer-right">
        <button class="explainer-btn explainer-btn-secondary explainer-copy-btn" type="button" data-text="${escapeForTemplate(explanation)}">
          Copy
        </button>
        <button class="explainer-btn explainer-btn-primary explainer-close-btn" type="button">
          Done
        </button>
      </div>
    </div>
  `;
  addModalEventListeners(currentModal);
}

function createNewExplanationModal(explanation, originalText, level) {
  shadowHost.style.pointerEvents = 'auto';
  const modal = document.createElement('div');
  modal.className = 'explainer-modal';

  const html = (marked && typeof marked.parse === 'function')
    ? marked.parse(explanation)
    : explanation;

  modal.innerHTML = `
    <div class="explainer-modal-content">
      <div class="explainer-header">
        <h3>Explanation
          <span class="explainer-level-badge">${getLevelName(level)}</span>
        </h3>
        <button class="explainer-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="explainer-body">
        <div class="explainer-original">
          <h4>Original text</h4>
          <p>"${truncateText(originalText, 250)}"</p>
        </div>
        <div class="explainer-explanation">
          <h4>${getLevelName(level)} explanation</h4>
          <div class="explainer-content">${html}</div>
        </div>
      </div>
      <div class="explainer-footer">
        <button class="explainer-btn explainer-btn-chat explainer-followup-btn" type="button">
          Ask a follow-up
        </button>
        <div class="explainer-footer-right">
          <button class="explainer-btn explainer-btn-secondary explainer-copy-btn" type="button" data-text="${escapeForTemplate(explanation)}">
            Copy
          </button>
          <button class="explainer-btn explainer-btn-primary explainer-close-btn" type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  `;

  addModalEventListeners(modal);
  shadowRoot.appendChild(modal);
  currentModal = modal;

  requestAnimationFrame(() => modal.classList.add('explainer-show'));
}

// Show error modal
function showErrorModal(error) {
  removeModal();
  modalLocked = false;
  shadowHost.style.pointerEvents = 'auto';

  const modal = document.createElement('div');
  modal.className = 'explainer-modal';
  modal.innerHTML = `
    <div class="explainer-modal-content explainer-error">
      <div class="explainer-header">
        <h3>Something went wrong</h3>
        <button class="explainer-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="explainer-body">
        <p class="explainer-error-message">${error}</p>
        <p class="explainer-error-help">Please try again, or select a shorter passage.</p>
      </div>
      <div class="explainer-footer">
        <button class="explainer-btn explainer-btn-primary explainer-close-btn" type="button">
          Close
        </button>
      </div>
    </div>
  `;

  addModalEventListeners(modal);
  shadowRoot.appendChild(modal);
  currentModal = modal;

  requestAnimationFrame(() => modal.classList.add('explainer-show'));
}

// ============= CHAT PANEL FUNCTIONS =============

function openChatPanel() {
  if (chatPanelOpen) return;
  chatPanelOpen = true;

  // Transform modal to split view
  if (currentModal) {
    currentModal.classList.add('explainer-split-view');
  }

  // Create chat panel
  const chatPanel = document.createElement('div');
  chatPanel.className = 'explainer-chat-panel';
  chatPanel.innerHTML = `
    <div class="explainer-chat-header">
      <h4>Follow-up</h4>
      <button class="explainer-chat-close" type="button">&times;</button>
    </div>
    <div class="explainer-chat-messages" id="chat-messages">
      <div class="explainer-chat-welcome">
        <p>Ask any follow-up questions about the explanation above.</p>
      </div>
    </div>
    <div class="explainer-chat-input-container">
      <textarea class="explainer-chat-input" placeholder="Ask a follow-up question..." rows="1"></textarea>
      <button class="explainer-chat-send" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
        </svg>
      </button>
    </div>
  `;

  shadowRoot.appendChild(chatPanel);

  // Add event listeners
  const closeBtn = chatPanel.querySelector('.explainer-chat-close');
  closeBtn.onclick = () => closeChatPanel();

  const textarea = chatPanel.querySelector('.explainer-chat-input');
  const sendBtn = chatPanel.querySelector('.explainer-chat-send');

  // Auto-resize textarea
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  });

  // Send on Enter (Shift+Enter for new line)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFollowUpQuestion(textarea.value.trim());
      textarea.value = '';
      textarea.style.height = 'auto';
    }
  });

  sendBtn.onclick = () => {
    sendFollowUpQuestion(textarea.value.trim());
    textarea.value = '';
    textarea.style.height = 'auto';
  };

  // Animate in
  requestAnimationFrame(() => {
    chatPanel.classList.add('explainer-chat-show');
    textarea.focus();
  });
}

function closeChatPanel() {
  if (!chatPanelOpen) return;
  chatPanelOpen = false;

  const chatPanel = shadowRoot.querySelector('.explainer-chat-panel');
  if (chatPanel) {
    chatPanel.classList.remove('explainer-chat-show');
    setTimeout(() => chatPanel.remove(), 300);
  }

  if (currentModal) {
    currentModal.classList.remove('explainer-split-view');
  }
}

function sendFollowUpQuestion(question) {
  if (!question) return;

  const messagesContainer = shadowRoot.querySelector('#chat-messages');
  if (!messagesContainer) return;

  // Remove welcome message if present
  const welcome = messagesContainer.querySelector('.explainer-chat-welcome');
  if (welcome) welcome.remove();

  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'explainer-chat-message explainer-chat-user';
  userMsg.innerHTML = `<p>${escapeHtml(question)}</p>`;
  messagesContainer.appendChild(userMsg);

  // Add loading message
  const loadingMsg = document.createElement('div');
  loadingMsg.className = 'explainer-chat-message explainer-chat-assistant explainer-chat-loading';
  loadingMsg.id = 'chat-loading';
  loadingMsg.innerHTML = `<div class="explainer-chat-typing"><span></span><span></span><span></span></div>`;
  messagesContainer.appendChild(loadingMsg);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Add to conversation history
  conversationHistory.push({ role: 'user', content: question });

  // Send to background script
  chrome.runtime.sendMessage({
    action: 'followUpQuestion',
    question: question,
    context: currentContext,
    history: conversationHistory
  });
}

function handleFollowUpResponse(response) {
  const messagesContainer = shadowRoot.querySelector('#chat-messages');
  if (!messagesContainer) return;

  // Remove loading message
  const loadingMsg = shadowRoot.querySelector('#chat-loading');
  if (loadingMsg) loadingMsg.remove();

  // Add assistant message
  const html = (marked && typeof marked.parse === 'function')
    ? marked.parse(response)
    : response;

  const assistantMsg = document.createElement('div');
  assistantMsg.className = 'explainer-chat-message explainer-chat-assistant';
  assistantMsg.innerHTML = `<div class="explainer-chat-content">${html}</div>`;
  messagesContainer.appendChild(assistantMsg);

  // Add to conversation history
  conversationHistory.push({ role: 'assistant', content: response });

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function handleFollowUpError(error) {
  const messagesContainer = shadowRoot.querySelector('#chat-messages');
  if (!messagesContainer) return;

  // Remove loading message
  const loadingMsg = shadowRoot.querySelector('#chat-loading');
  if (loadingMsg) loadingMsg.remove();

  // Add error message
  const errorMsg = document.createElement('div');
  errorMsg.className = 'explainer-chat-message explainer-chat-error';
  errorMsg.innerHTML = `<p>${escapeHtml(error)}</p>`;
  messagesContainer.appendChild(errorMsg);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============= END CHAT PANEL FUNCTIONS =============

// Add event listeners
function addModalEventListeners(modal) {
  modal.querySelectorAll('.explainer-close, .explainer-close-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      modalLocked = false;
      closeChatPanel();
      closeModal();
    };
  });

  const copyBtn = modal.querySelector('.explainer-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = (e) => {
      e.preventDefault();
      copyToClipboard(copyBtn.dataset.text, copyBtn);
    };
  }

  const followUpBtn = modal.querySelector('.explainer-followup-btn');
  if (followUpBtn) {
    followUpBtn.onclick = (e) => {
      e.preventDefault();
      openChatPanel();
    };
  }

  modal.onclick = (e) => {
    if (modalLocked) return;
    const content = modal.querySelector('.explainer-modal-content');
    const chatPanel = shadowRoot.querySelector('.explainer-chat-panel');
    if (content && !content.contains(e.target) && (!chatPanel || !chatPanel.contains(e.target))) {
      closeChatPanel();
      closeModal();
    }
  };
}

// Close modal
function closeModal() {
  if (currentModal && !isClosing) {
    isClosing = true;
    closeChatPanel();
    currentModal.classList.remove('explainer-show');

    setTimeout(() => {
      if (currentModal && shadowRoot.contains(currentModal)) {
        shadowRoot.removeChild(currentModal);
      }
      currentModal = null;
      isClosing = false;
      shadowHost.style.pointerEvents = 'none';
      conversationHistory = [];
      currentContext = { originalText: '', explanation: '', level: '' };
    }, 300);
  }
}

// Remove modal immediately
function removeModal() {
  if (currentModal && shadowRoot.contains(currentModal)) {
    shadowRoot.removeChild(currentModal);
  }
  currentModal = null;
  isClosing = false;
  chatPanelOpen = false;
}

// Utility functions
function getLevelName(level) {
  const names = { grade5: 'Kid-friendly', highschool: 'High school', college: 'College', expert: 'Expert' };
  return names[level] || 'Standard';
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function escapeForTemplate(text) {
  if (!text) return '';
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = originalText; }, 2000);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

// Get modal styles (include your CSS here)
function getModalStyles() {
  return `
    .explainer-modal {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(17, 24, 39, 0.55); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.2s ease;
      font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      color: #111827;
    }
    .explainer-modal.explainer-show { opacity: 1; }
    .explainer-modal.explainer-split-view {
      justify-content: flex-start;
      padding-left: 5%;
    }
    .explainer-modal.explainer-split-view .explainer-modal-content {
      max-width: 55%;
      margin-right: 20px;
    }
    .explainer-modal-content {
      background: #fff;
      border-radius: 12px;
      max-width: 680px;
      width: 92%;
      max-height: 85vh;
      overflow: hidden;
      transform: translateY(8px);
      transition: transform 0.2s ease;
      box-shadow: 0 24px 48px rgba(17, 24, 39, 0.18);
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
    }
    .explainer-modal.explainer-show .explainer-modal-content { transform: translateY(0); }
    .explainer-header {
      background: #111827;
      color: #fff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .explainer-header h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.01em;
    }
    .explainer-level-badge {
      background: rgba(255,255,255,0.12);
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      color: #e5e7eb;
    }
    .explainer-close {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
    }
    .explainer-close:hover { background: rgba(255,255,255,0.08); }
    .explainer-body { padding: 20px; overflow-y: auto; max-height: 60vh; background: #fff; }
    .explainer-original {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 18px;
    }
    .explainer-original h4, .explainer-explanation h4 {
      margin: 0 0 8px 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .explainer-original p { margin: 0; color: #4b5563; font-size: 14px; line-height: 1.55; }
    .explainer-content { line-height: 1.7; color: #1f2937; font-size: 15px; }
    .explainer-footer {
      padding: 14px 20px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
    }
    .explainer-footer-right { display: flex; gap: 8px; }
    .explainer-btn {
      padding: 9px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      font-family: inherit;
    }
    .explainer-btn-primary { background: #111827; color: #fff; }
    .explainer-btn-primary:hover { background: #1f2937; }
    .explainer-btn-secondary { background: #fff; color: #111827; border-color: #e5e7eb; }
    .explainer-btn-secondary:hover { background: #f9fafb; }
    .explainer-btn-chat { background: #fff; color: #111827; border-color: #e5e7eb; }
    .explainer-btn-chat:hover { background: #f9fafb; }
    .explainer-spinner {
      width: 28px; height: 28px;
      border: 2px solid #e5e7eb;
      border-top-color: #111827;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin: 28px auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .explainer-loading p { text-align: center; color: #6b7280; font-size: 14px; }
    .explainer-loading-dots::after { content: ''; animation: dots 1.5s infinite; }
    @keyframes dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }
    .explainer-error-message { color: #b91c1c; font-weight: 500; margin: 0 0 8px; }
    .explainer-error-help { color: #6b7280; font-size: 14px; margin: 0; }
    .explainer-content h1, .explainer-content h2, .explainer-content h3, .explainer-content h4 {
      margin: 1em 0 0.5em 0; font-weight: 600; color: #111827;
    }
    .explainer-content h1 { font-size: 1.35em; }
    .explainer-content h2 { font-size: 1.2em; }
    .explainer-content h3 { font-size: 1.08em; }
    .explainer-content p { margin: 0 0 1em 0; }
    .explainer-content ul, .explainer-content ol { margin: 0 0 1em 1.5em; padding: 0; }
    .explainer-content li { margin-bottom: 0.4em; }
    .explainer-content code {
      background: #f3f4f6; padding: 2px 6px; border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em; color: #111827;
    }
    .explainer-content pre {
      background: #111827; color: #e5e7eb; padding: 14px; border-radius: 8px;
      overflow-x: auto; margin: 1em 0;
    }
    .explainer-content pre code { background: none; color: inherit; padding: 0; }
    .explainer-content blockquote {
      border-left: 2px solid #d1d5db; margin: 1em 0; padding-left: 14px;
      color: #6b7280;
    }
    .explainer-content strong { font-weight: 600; }
    .explainer-content a { color: #2563eb; }
    .explainer-chat-panel {
      position: fixed;
      top: 50%;
      right: -400px;
      transform: translateY(-50%);
      width: 360px;
      max-height: 85vh;
      background: #fff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 24px 48px rgba(17, 24, 39, 0.18);
      display: flex;
      flex-direction: column;
      transition: right 0.25s ease;
      font-family: Inter, "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
    }
    .explainer-chat-panel.explainer-chat-show { right: 5%; }
    .explainer-chat-header {
      background: #111827;
      color: #fff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .explainer-chat-header h4 { margin: 0; font-size: 14px; font-weight: 600; }
    .explainer-chat-close {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      font-size: 18px;
      cursor: pointer;
    }
    .explainer-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 280px;
      max-height: calc(85vh - 140px);
    }
    .explainer-chat-welcome { text-align: center; color: #6b7280; font-size: 13px; padding: 36px 16px; }
    .explainer-chat-message {
      max-width: 85%;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
    }
    .explainer-chat-user {
      align-self: flex-end;
      background: #111827;
      color: #fff;
    }
    .explainer-chat-user p { margin: 0; }
    .explainer-chat-assistant {
      align-self: flex-start;
      background: #f3f4f6;
      color: #1f2937;
    }
    .explainer-chat-content p { margin: 0 0 0.5em 0; }
    .explainer-chat-content p:last-child { margin-bottom: 0; }
    .explainer-chat-content code {
      background: #e5e7eb; padding: 2px 4px; border-radius: 3px; font-size: 0.85em;
    }
    .explainer-chat-content pre {
      background: #111827; color: #e5e7eb; padding: 10px; border-radius: 8px; overflow-x: auto;
    }
    .explainer-chat-content pre code { background: none; color: inherit; padding: 0; }
    .explainer-chat-content ul, .explainer-chat-content ol { margin: 0.5em 0 0.5em 1.2em; padding: 0; }
    .explainer-chat-error {
      align-self: flex-start;
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .explainer-chat-error p { margin: 0; }
    .explainer-chat-typing { display: flex; gap: 4px; }
    .explainer-chat-typing span {
      width: 6px; height: 6px; background: #9ca3af; border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out;
    }
    .explainer-chat-typing span:nth-child(2) { animation-delay: 0.2s; }
    .explainer-chat-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }
    .explainer-chat-input-container {
      padding: 12px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .explainer-chat-input {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      resize: none;
      outline: none;
      font-family: inherit;
      max-height: 120px;
    }
    .explainer-chat-input:focus { border-color: #111827; }
    .explainer-chat-send {
      background: #111827;
      border: none;
      color: #fff;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .explainer-chat-send:hover { background: #1f2937; }
    @media (max-width: 900px) {
      .explainer-modal.explainer-split-view {
        flex-direction: column;
        padding: 16px;
        justify-content: flex-start;
      }
      .explainer-modal.explainer-split-view .explainer-modal-content {
        max-width: 100%;
        max-height: 45vh;
        margin-right: 0;
        margin-bottom: 10px;
      }
      .explainer-chat-panel {
        position: relative;
        top: auto;
        right: auto !important;
        transform: none;
        width: 100%;
        max-height: 40vh;
      }
    }
  `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
