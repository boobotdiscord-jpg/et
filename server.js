require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Allow CORS so your frontend can connect when deployed
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const youtube = google.youtube({ 
  version: 'v3', 
  auth: process.env.YOUTUBE_API_KEY // Use Environment Variable
});

const VIDEO_ID = '5H0CKe-FVD8';
let activeLiveChatId = null;
let nextPageToken = null;

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function updateLiveDetails() {
  try {
    const res = await youtube.videos.list({
      part: 'liveStreamingDetails',
      id: VIDEO_ID
    });

    if (!res.data.items?.length) return;

    const details = res.data.items[0].liveStreamingDetails;
    const viewers = details.concurrentViewers || 0;
    activeLiveChatId = details.activeLiveChatId;

    io.emit('viewerCount', viewers);
  } catch (err) {
    console.error("Error fetching live details:", err.message);
  }
}

async function pollLiveChat() {
  if (!activeLiveChatId) {
    setTimeout(pollLiveChat, 10000);
    return;
  }

  try {
    const res = await youtube.liveChatMessages.list({
      liveChatId: activeLiveChatId,
      part: 'snippet,authorDetails',
      pageToken: nextPageToken
    });

    nextPageToken = res.data.nextPageToken;
    const messages = res.data.items;

    if (messages?.length > 0) {
      io.emit('newMessages', messages);
    }

    // Respect YouTube's recommended wait time
    const waitTime = res.data.pollingIntervalMillis || 10000;
    setTimeout(pollLiveChat, waitTime);
  } catch (err) {
    console.error("Chat Poll Error:", err.message);
    setTimeout(pollLiveChat, 10000);
  }
}

// Initial Kickoff
updateLiveDetails().then(() => pollLiveChat());
setInterval(updateLiveDetails, 60000); // Check viewers every minute

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));