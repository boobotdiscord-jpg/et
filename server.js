require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS for all origins to prevent connection errors
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

// Serve the index.html file to the browser
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Function to fetch viewers and Chat ID
async function updateLiveDetails() {
  try {
    const res = await youtube.videos.list({
      // We check statistics as a backup if liveStreamingDetails is delayed
      part: 'liveStreamingDetails,statistics',
      id: VIDEO_ID
    });

    if (!res.data.items?.length) {
      console.log("Video not found or API key issue.");
      return;
    }

    const live = res.data.items[0].liveStreamingDetails;
    const stats = res.data.items[0].statistics;

    // Logic to fix the "0 viewers" issue: check live count first, then total view stats
    const viewers = live?.concurrentViewers || stats?.viewCount || 0;
    activeLiveChatId = live?.activeLiveChatId;

    console.log(`Current Status: ${viewers} watching.`);
    io.emit('viewerCount', viewers);
  } catch (err) {
    console.error("YouTube API Error (Viewers):", err.message);
  }
}

// Function to poll chat messages
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
    const messages = res.data.items;

    if (messages?.length > 0) {
      io.emit('newMessages', messages);
    }

    // Follow YouTube's suggested wait time to avoid quota bans
    const waitTime = res.data.pollingIntervalMillis || 10000;
    setTimeout(pollLiveChat, waitTime);
  } catch (err) {
    console.error("YouTube API Error (Chat):", err.message);
    setTimeout(pollLiveChat, 10000);
  }
}

// Initializing the loops
updateLiveDetails().then(() => pollLiveChat());
setInterval(updateLiveDetails, 60000); // Update viewer count every minute to save quota

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
