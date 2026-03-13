const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

// Get matchId from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const matchId = urlParams.get("matchId") || "default";

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;

// Join the specific match room
socket.emit("joinMatch", matchId);

const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";
  board.forEach((row, rowIndex) => {
    row.forEach((square, squareIndex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark"
      );

      squareElement.dataset.row = rowIndex;
      squareElement.dataset.col = squareIndex;

      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );

        pieceElement.innerText = getPieceUnicode(square);
        pieceElement.draggable = playerRole === square.color;

        pieceElement.addEventListener("dragstart", (e) => {
          if (pieceElement.draggable) {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowIndex, col: squareIndex };
            e.dataTransfer.setData("text/plain", "");
          }
        });

        pieceElement.addEventListener("dragend", (e) => {
          draggedPiece = null;
          sourceSquare = null;
        });

        squareElement.appendChild(pieceElement);
      }

      squareElement.addEventListener("dragover", function (e) {
        e.preventDefault();
      });

      squareElement.addEventListener("drop", function (e) {
        e.preventDefault();
        if (draggedPiece) {
          const targetSquare = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };

          handleMove(sourceSquare, targetSquare);
        }
      });
      boardElement.appendChild(squareElement);
    });
  });

  if (playerRole === "b") {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }

  renderMoveHistory();
};

const renderMoveHistory = () => {
  const historyElement = document.getElementById("history-content");
  const history = chess.history();
  historyElement.innerHTML = "";

  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = history[i];
    const blackMove = history[i + 1] || "";

    const numDiv = document.createElement("div");
    numDiv.classList.add("text-zinc-500");
    numDiv.innerText = `${moveNumber}.`;

    const whiteDiv = document.createElement("div");
    whiteDiv.classList.add("text-zinc-200");
    whiteDiv.innerText = whiteMove;

    const blackDiv = document.createElement("div");
    blackDiv.classList.add("text-zinc-200");
    blackDiv.innerText = blackMove;

    historyElement.appendChild(numDiv);
    historyElement.appendChild(whiteDiv);
    historyElement.appendChild(blackDiv);
  }

  // Scroll to bottom
  const scrollContainer = document.getElementById("move-history");
  scrollContainer.scrollTop = scrollContainer.scrollHeight;
};

let pendingMove = null;

const handleMove = (source, target) => {
  const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
  const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;

  // Check for promotion
  const piece = chess.get(from);
  if (piece && piece.type === "p") {
    if ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1")) {
      pendingMove = { from, to };
      document.getElementById("promotion-modal").classList.remove("hidden");
      document.getElementById("promotion-modal").style.display = "flex";
      return;
    }
  }

  socket.emit("move", { from, to, promotion: "q" });
};

window.selectPromotion = (pieceType) => {
  if (pendingMove) {
    socket.emit("move", { ...pendingMove, promotion: pieceType });
    pendingMove = null;
    document.getElementById("promotion-modal").style.display = "none";
    document.getElementById("promotion-modal").classList.add("hidden");
  }
};

const getPieceUnicode = (piece) => {
  const unicodePieces = {
    w: {
      p: "♙",
      r: "♖",
      n: "♘",
      b: "♗",
      q: "♕",
      k: "♔",
    },
    b: {
      p: "♟",
      r: "♜",
      n: "♞",
      b: "♝",
      q: "♛",
      k: "♚",
    }
  };

  return unicodePieces[piece.color][piece.type] || "";
};

socket.on("playerRole", function (role) {
  playerRole = role;
  renderBoard();
});

socket.on("spectatorRole", function () {
  playerRole = null;
  renderBoard();
});

socket.on("boardState", function (fen) {
  chess.load(fen);
  renderBoard();
  const turn = chess.turn();
  const turnDisplay = document.getElementById("turn-display");
  if (turnDisplay) {
    turnDisplay.innerText = "Turn: " + (turn === "w" ? "White" : "Black");
  }
});

socket.on("timerUpdate", function (timers) {
  updateTimerDisplay("white-timer", timers.w);
  updateTimerDisplay("black-timer", timers.b);
});

socket.on("move", function (move) {
  chess.move(move);
  // Redundant render removed to prevent UI jitter
});

const updateTimerDisplay = (id, seconds) => {
  const element = document.getElementById(id);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const label = id.includes("white") ? "White" : "Black";
  element.innerText = `${label}: ${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  if (seconds < 30) {
    element.classList.add("text-red-500", "animate-pulse");
  } else {
    element.classList.remove("text-red-500", "animate-pulse");
  }
};

socket.on("game_over", function (message) {
  document.getElementById("winner-message").innerText = message;
  document.getElementById("game-over-modal").style.display = "flex";
  
  const pieces = document.querySelectorAll(".piece");
  pieces.forEach(piece => {
    piece.draggable = false;
  });
});

window.resetGame = () => {
    socket.emit("resetGame");
};

renderBoard();
