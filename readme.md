<div align="center">

# 🎭 IMPOSTER

### *A Real-Time Multiplayer Word Deduction & Bluffing Party Game*

[![Node.js Version](https://img.shields.io/badge/Node.js-v16+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.7.5-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Express](https://img.shields.io/badge/Express-v4.19.2-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/dharshan08092005/Imposter-Game/pulls)

<br/>

> **One secret word. One or more imposters. Can you spot the liar before they figure out the word?**

<br/>

[Features](#-key-features) •
[How It Works](#-how-to-play) •
[Tech Stack](#-tech-stack) •
[Quick Start](#-quick-start) •
[Project Structure](#-project-structure) •
[Deployment](#-deployment) •
[Customization](#-customizing-the-game)

<br/>

</div>

---

## 🌟 Overview

**IMPOSTER** is a fast-paced, real-time social deduction game designed for groups of friends. 

Every player receives a **Secret Word** from an expansive dictionary—**except the Imposter(s)**, who are given nothing! Players take turns providing brief, one-sentence clues about their word. 

- **Crewmates** must provide clues specific enough to prove they know the word, but subtle enough not to give it away to the Imposter.
- **Imposters** must listen carefully, bluff their way through with believable clues, and try to deduce the word while evading suspicion!

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| ⚡ **Instant Rooms & Codes** | Host private game lobbies with quick 6-digit room codes to share with friends. |
| 🔄 **Real-Time Sync** | Powered by **Socket.IO** for zero-latency turn indicators, clue broadcasts, and live voting. |
| ⏱️ **Turn-Based Clue Engine** | Configurable round timers with active turn cues and clue history timeline. |
| 🗳️ **Interactive Voting Phase** | Dynamic elimination voting system with real-time status updates and suspenseful reveals. |
| 🎨 **Modern Glassmorphism UI** | Sleek dark-mode aesthetic built with vanilla CSS, neon ambient glows, and responsive typography (*Outfit* & *Plus Jakarta Sans*). |
| 📚 **Curated Word Bank** | 10+ categories (Movies, Animals, Nature, Technology, Foods, Places, etc.) with smart anti-repeat selection. |
| ⚙️ **Configurable Host Settings** | Hosts can tailor the imposter count (1–3) and turn durations (15s–45s). |
| 🔁 **Seamless Replay Loop** | Play back-to-back rounds without needing to recreate rooms or re-enter codes. |

---

## 🎮 How to Play

```
   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
   │ 1. Lobby    │ ───►  │ 2. Reveal   │ ───►  │ 3. Clues    │ ───►  │ 4. Voting   │
   │ Host/Join   │       │ Role & Word │       │ Take Turns  │       │ Eliminate!  │
   └─────────────┘       └─────────────┘       └─────────────┘       └─────────────┘
                                                                            │
                                          ┌──────────────┐                  │
                                          │ 5. Results   │ ◄────────────────┘
                                          │ Win / Reveal │
                                          └──────────────┘
```

### Roles & Objectives

<table>
  <tr>
    <th width="50%">🟢 The Crewmates</th>
    <th width="50%">🔴 The Imposter(s)</th>
  </tr>
  <tr>
    <td>
      <ul>
        <li><b>Knowledge:</b> You know the exact Secret Word and its category.</li>
        <li><b>Goal:</b> Give clues that show you know the word without revealing it.</li>
        <li><b>Strategy:</b> Catch players whose clues feel too vague, copycat, or out of place.</li>
        <li><b>Win Condition:</b> Successfully identify and vote out all Imposters!</li>
      </ul>
    </td>
    <td>
      <ul>
        <li><b>Knowledge:</b> You do <i>not</i> know the word. You only know you are an Imposter.</li>
        <li><b>Goal:</b> Blend in seamlessly with other players' clues.</li>
        <li><b>Strategy:</b> Analyze previous clues to deduce the theme, then craft a chameleon clue.</li>
        <li><b>Win Condition:</b> Survive until Imposters equal or outnumber the Crewmates!</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🛠️ Tech Stack

- **Backend:** [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
- **Real-Time Engine:** [Socket.IO](https://socket.io/) (WebSockets with polling fallback)
- **Frontend:** Vanilla HTML5, Modern CSS (Glassmorphism & Flexbox/CSS Grid), ES6+ JavaScript
- **Fonts:** [Outfit](https://fonts.google.com/specimen/Outfit) & [Plus+Jakarta+Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

---

## 🚀 Quick Start

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (version 16 or newer) and `npm` installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dharshan08092005/Imposter-Game.git
   cd Imposter-Game
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local server:**
   ```bash
   npm start
   ```

4. **Play the game:**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
   > 💡 **Tip:** Open multiple tabs or invite friends on your local network (`http://<YOUR_LOCAL_IP>:3000`) to test real-time multiplayer!

5. **Health Check Endpoint:**
   Verify your server is up and running by visiting:
   ```
   http://localhost:3000/alive
   ```

---

## 📁 Project Structure

```text
├── public/
│   ├── index.html       # Single-page application structure & UI screens
│   ├── client.js        # Client-side Socket.IO handler & state machine
│   └── style.css        # Premium dark glassmorphic styling & responsive layouts
├── words.js             # Categorized word bank & anti-repeat picker logic
├── server.js            # Node/Express server & Socket.IO multiplayer game manager
├── package.json         # Project metadata and dependencies
├── .gitignore           # Git ignore rules for node_modules, logs, and env files
└── readme.md            # Project documentation
```

---

## 🌐 Deployment

Because **IMPOSTER** utilizes stateful in-memory rooms and persistent bi-directional **Socket.IO** connections, it should be deployed on platforms that support long-running Node.js processes:

### Recommended Hosting Services

| Platform | Free Tier? | WebSockets | Deployment Steps |
| :--- | :---: | :---: | :--- |
| **[Render](https://render.com/)** *(Recommended)* | ✅ Yes | Native | 1. Create a new **Web Service**<br/>2. Connect your repo<br/>3. Build Command: `npm install`<br/>4. Start Command: `npm start` |
| **[Railway](https://railway.app/)** | ✅ Yes | Native | Connect repo and deploy automatically. Handles ports and sockets out of the box. |
| **[Fly.io](https://fly.io/)** | ✅ Yes | Native | Deploy via `fly launch` with automatic container orchestration. |

> ⚠️ **Note on Vercel/Netlify:** Serverless platforms like Vercel do not support long-lived WebSocket connections or in-memory game state. Use containerized platforms like Render or Railway instead.

---

## 🎨 Customizing the Game

### Adding New Words or Categories
Open [words.js](file:///d:/Imposter/words.js) and add your custom themes or words:

```javascript
const WORD_BANK = {
  "Superheroes": [
    "SPIDERMAN", "BATMAN", "IRON_MAN", "THOR", "WOLVERINE"
  ],
  // Add your own custom categories here!
};
```

### Adjusting Defaults
In [server.js](file:///d:/Imposter/server.js), you can change default port or round settings:
```javascript
const PORT = process.env.PORT || 3000;
```

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create! Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">
  <sub>Built with ❤️ for fun game nights with friends.</sub>
</div>
