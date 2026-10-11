document.addEventListener('DOMContentLoaded', async () => {
  const defaultLevelSelect = document.getElementById('defaultLevel');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const statusDiv = document.getElementById('status');
  const explanationCountEl = document.getElementById('explanationCount');
  const favoriteLevelEl = document.getElementById('favoriteLevel');

  const levelLabels = {
    grade5: 'Kid-friendly',
    highschool: 'High school',
    college: 'College',
    expert: 'Expert'
  };

  await loadSettings();
  await updateStatistics();

  saveSettingsBtn.addEventListener('click', async () => {
    const defaultLevel = defaultLevelSelect.value;

    try {
      saveSettingsBtn.classList.add('loading');
      saveSettingsBtn.disabled = true;

      await chrome.storage.local.set({
        defaultLevel: defaultLevel
      });

      showStatus('Preferences saved', 'success');
    } catch (error) {
      showStatus('Failed to save preferences', 'error');
      console.error('Save error:', error);
    } finally {
      saveSettingsBtn.classList.remove('loading');
      saveSettingsBtn.disabled = false;
    }
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['defaultLevel']);
      defaultLevelSelect.value = result.defaultLevel || 'highschool';
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function updateStatistics() {
    try {
      const result = await chrome.storage.local.get(['explanationCount', 'levelUsage']);
      explanationCountEl.textContent = result.explanationCount || 0;

      const levelUsage = result.levelUsage || {};
      const favoriteLevel = Object.keys(levelUsage).reduce((a, b) =>
        levelUsage[a] > levelUsage[b] ? a : b, 'highschool'
      );

      favoriteLevelEl.textContent = levelLabels[favoriteLevel] || 'High school';
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }

  defaultLevelSelect.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettingsBtn.click();
    }
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'updateStats') {
      updateStatistics();
    }
  });
});

chrome.runtime.onMessage.addListener(async (request) => {
  if (request.action === 'explanationUsed') {
    try {
      const result = await chrome.storage.local.get(['explanationCount', 'levelUsage']);

      const newCount = (result.explanationCount || 0) + 1;
      const levelUsage = result.levelUsage || {};
      levelUsage[request.level] = (levelUsage[request.level] || 0) + 1;

      await chrome.storage.local.set({
        explanationCount: newCount,
        levelUsage: levelUsage
      });

      const explanationCountEl = document.getElementById('explanationCount');
      if (explanationCountEl) {
        explanationCountEl.textContent = newCount;
      }
    } catch (error) {
      console.error('Failed to update statistics:', error);
    }
  }
});
