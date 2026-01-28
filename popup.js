// popup.js - 修复版

function init() {
  // 获取当前标签页
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      window.close();
      return;
    }

    const currentTab = tabs[0];

    // 排除无法注入的页面 (如 chrome:// 开头的页面)
    if (currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('edge://')) {
      alert('插件无法在浏览器系统页面运行，请在普通网页上使用。');
      window.close();
      return;
    }

    // 尝试发送消息
    sendMessageToContent(currentTab.id);
  });
}

function sendMessageToContent(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { action: 'togglePanel' }, (response) => {
      // 检查是否发生错误 (例如 content script 没加载)
      if (chrome.runtime.lastError) {
        console.warn('连接失败:', chrome.runtime.lastError.message);
        
        // 核心修复：如果是连接错误，提示用户刷新
        if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
            alert('插件脚本未加载。\n\n请刷新当前页面后重试！(F5)');
        } else {
            alert('发生错误: ' + chrome.runtime.lastError.message);
        }
      } else {
        console.log('面板切换成功');
      }
      
      // 无论成功失败，都关闭 popup 小窗口
      window.close();
    });
  } catch (e) {
    console.error('发送异常:', e);
    window.close();
  }
}

// 启动
init();