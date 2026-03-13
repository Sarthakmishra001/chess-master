const express = require("express");
const socketIo = require("socket.io");
const path = require("path");
const http = require("http");
const { Chess } = require("chess.js");
const mongoose = require("mongoose");
const Match = require("./models/Match");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB Connection
mongoose.connect("mongodb://localhost:27017/chess")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

const games = {};

app.get("/", function (req, res) {
  res.render("index");
});

app.get("/match-history", async function (req, res) {
  try {
    const matches = await Match.find().sort({ createdAt: -1 });
    res.render("match-history", { matches });
  } catch (err) {
    console.error("Error fetching match history:", err);
    res.status(500).send("Internal Server Error");
  }
});

io.on("connection", function (uniqueSocket) {
  console.log("A user connected:", uniqueSocket.id);

  let currentMatchId = null;

  const initializeGame = (matchId) => {
    const game = games[matchId];
    if (game && game.intervalId) {
      clearInterval(game.intervalId);
    }
    
    // Completely wipe and reset
    games[matchId] = {
      chess: new Chess(),
      players: game ? game.players : {},
      timer: { w: 300, b: 300 },
      intervalId: null,
    };
    
    console.log(`[${matchId}] Game state initialized.`);
    return games[matchId];
  };

  const startTimer = (matchId) => {
    const game = games[matchId];
    if (!game) return;

    // Check if both players are present and game is NOT over
    if (game.players.white && game.players.black && !game.intervalId && !game.chess.isGameOver()) {
      console.log(`[${matchId}] Starting game timer...`);
      game.intervalId = setInterval(() => {
        const turn = game.chess.turn();
        
        // Safety check for timer existence
        if (!game.timer || typeof game.timer[turn] === 'undefined') {
            console.error(`[${matchId}] Timer error: missing timer for ${turn}`);
            return;
        }

        if (game.timer[turn] > 0) {
          game.timer[turn]--;
          io.to(matchId).emit("timerUpdate", game.timer);
        } else {
          // Time out
          clearInterval(game.intervalId);
          game.intervalId = null;
          const winner = turn === "w" ? "Black" : "White";
          const reason = `TIME OUT\n${winner} wins!`;
          io.to(matchId).emit("game_over", reason);
          saveMatch(matchId, reason);
          console.log(`[${matchId}] Game ended by time out: ${winner} wins`);
        }
      }, 1000);
    }
  };

  uniqueSocket.on("joinMatch", function (matchId) {
    currentMatchId = matchId || "default";
    uniqueSocket.join(currentMatchId);

    if (!games[currentMatchId]) {
      initializeGame(currentMatchId);
    }

    const game = games[currentMatchId];

    // Assign roles if slots are empty
    if (!game.players.white && !Object.values(game.players).includes(uniqueSocket.id)) {
      game.players.white = uniqueSocket.id;
    } else if (!game.players.black && !Object.values(game.players).includes(uniqueSocket.id)) {
      game.players.black = uniqueSocket.id;
    }

    // Emit current state
    if (game.players.white === uniqueSocket.id) uniqueSocket.emit("playerRole", "w");
    else if (game.players.black === uniqueSocket.id) uniqueSocket.emit("playerRole", "b");
    else uniqueSocket.emit("spectatorRole");

    updateSpectatorCount(currentMatchId);
    uniqueSocket.emit("boardState", game.chess.fen());
    uniqueSocket.emit("timerUpdate", game.timer);

    startTimer(currentMatchId);
  });

  uniqueSocket.on("resetGame", function () {
    if (!currentMatchId || !games[currentMatchId]) return;
    const game = games[currentMatchId];
    // Only players can reset
    if (uniqueSocket.id === game.players.white || uniqueSocket.id === game.players.black) {
      initializeGame(currentMatchId);
      io.to(currentMatchId).emit("boardState", games[currentMatchId].chess.fen());
      io.to(currentMatchId).emit("timerUpdate", games[currentMatchId].timer);
      startTimer(currentMatchId);
      console.log(`[${currentMatchId}] Game reset by ${uniqueSocket.id}`);
    }
  });

  const updateSpectatorCount = (matchId) => {
    const game = games[matchId];
    if (!game) return;
    
    const room = io.sockets.adapter.rooms.get(matchId);
    const totalClients = room ? room.size : 0;
    let playersCount = 0;
    if (game.players.white) playersCount++;
    if (game.players.black) playersCount++;
    
    const spectatorsCount = Math.max(0, totalClients - playersCount);
    io.to(matchId).emit("spectatorCount", spectatorsCount);
  };

  const saveMatch = async (matchId, result) => {
    const game = games[matchId];
    if (!game) return;

    try {
      const match = new Match({
        player1: game.players.white || "White Player",
        player2: game.players.black || "Black Player",
        moves: game.chess.history(),
        result: result.trim().replace(/\n/g, " "),
      });
      await match.save();
      console.log(`[${matchId}] Match saved success: ${match.result}`);
    } catch (err) {
      console.error(`[${matchId}] Error saving match:`, err);
    }
  };

  uniqueSocket.on("disconnect", function () {
    console.log(`User disconnected: ${uniqueSocket.id}`);
    if (currentMatchId && games[currentMatchId]) {
      const game = games[currentMatchId];
      if (uniqueSocket.id === game.players.white) {
        delete game.players.white;
      } else if (uniqueSocket.id === game.players.black) {
        delete game.players.black;
      }

      updateSpectatorCount(currentMatchId);

      // Stop timer if a player leaves
      if (!game.players.white || !game.players.black) {
        if (game.intervalId) {
          clearInterval(game.intervalId);
          game.intervalId = null;
        }
      }
    }
  });

  uniqueSocket.on("move", function (move) {
    if (!currentMatchId || !games[currentMatchId]) return;
    const game = games[currentMatchId];
    const chess = game.chess;
    const players = game.players;

    if (chess.isGameOver() || (game.timer.w <= 0 || game.timer.b <= 0)) {
       uniqueSocket.emit("invalidMove", move);
       return;
    }

    try {
      // Validate turn
      const turn = chess.turn();
      if (turn === "w" && uniqueSocket.id !== players.white) {
        return uniqueSocket.emit("invalidMove", { ...move, error: "Not your turn (White)" });
      }
      if (turn === "b" && uniqueSocket.id !== players.black) {
        return uniqueSocket.emit("invalidMove", { ...move, error: "Not your turn (Black)" });
      }

      const result = chess.move(move);
      if (result) {
        io.to(currentMatchId).emit("move", move);
        io.to(currentMatchId).emit("boardState", chess.fen());
        console.log(`[${currentMatchId}] Move: ${result.from} -> ${result.to}`);

        if (chess.isGameOver()) {
          if (game.intervalId) {
            clearInterval(game.intervalId);
            game.intervalId = null;
          }
          let reason = "Game Over";
          if (chess.isCheckmate()) {
            reason = `CHECKMATE\n${chess.turn() === "w" ? "Black" : "White"} wins!`;
          } else if (chess.isDraw()) {
            reason = "DRAW";
          } else if (chess.isStalemate()) {
            reason = "STALEMATE";
          } else if (chess.isThreefoldRepetition()) {
            reason = "THREEFOLD REPETITION";
          } else if (chess.isInsufficientMaterial()) {
            reason = "INSUFFICIENT MATERIAL";
          }
          io.to(currentMatchId).emit("game_over", reason);
          saveMatch(currentMatchId, reason);
        }
      } else {
        uniqueSocket.emit("invalidMove", move);
      }
    } catch (err) {
      console.error(`[${currentMatchId}] Move Error:`, err);
      uniqueSocket.emit("invalidMove", move);
    }
  });
});

server.listen(3000, function () {
  console.log("Server running on http://localhost:3000");
});
