require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS for deployment
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const youtube = google.youtube({ 
  version: 'v3', 
  auth: process.env.YOUTUBE_API_KEY 
});

const VIDEO_ID = '5H0CKe-FVD8';
let activeLiveChatId = null;
let nextPageToken = null;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function updateLiveDetails() {
  try {
    const res = await youtube.videos.list({
      part: 'liveStreamingDetails,statistics',
      id: VIDEO_ID
    });

    if (!res.data.items?.length) return;

    const live = res.data.items[0].liveStreamingDetails;
    const stats = res.data.items[0].statistics;

    // Fix for the 0 viewers issue: check concurrent first, then total viewCount as fallback
    const viewers = live?.concurrentViewers || stats?.viewCount || 0;
    activeLiveChatId = live?.activeLiveChatId;

    io.emit('viewerCount', viewers);
  } catch (err) {
    console.error("API Error (Viewers):", err.message);
  }
}

async function pollLiveChat() {
  if (!activeLiveChatId) {
    setTimeout(pollLiveChat, 5000);
    return;
  }

  try {
    const res = await youtube.liveChatMessages.list({
      liveChatId: activeLiveChatId,
      part: 'snippet,authorDetails',
      pageToken: nextPageToken
    });

    nextPageToken = res.data.nextPageToken;
    if (res.data.items?.length > 0) {
      io.emit('newMessages', res.data.items);
    }

    const waitTime = res.data.pollingIntervalMillis || 10000;
    setTimeout(pollLiveChat, waitTime);
  } catch (err) {
    console.error("API Error (Chat):", err.message);
    setTimeout(pollLiveChat, 10000);
  }
}

updateLiveDetails().then(() => pollLiveChat());
setInterval(updateLiveDetails, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
