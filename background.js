// Background service worker
// 主要用于处理扩展的生命周期和消息转发

chrome.runtime.onInstalled.addListener(() => {
  console.log('来找茬插件已安装');
});

// 处理来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: 收到消息', message);
  sendResponse({ success: true });
});
