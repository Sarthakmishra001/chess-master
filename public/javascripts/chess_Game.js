const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

// Get matchId from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const matchId = urlParams.get("matchId") || "default";

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let moveHistoryData = [];

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
  if (!historyElement) return;
  const history = moveHistoryData;
  historyElement.innerHTML = "";

  if (history.length === 0) {
    historyElement.innerHTML = '<div style="color:#3f3f46; text-align:center; padding-top:20px; font-size:0.78rem; font-family:Inter,sans-serif; grid-column:1/-1;">No moves yet…</div>';
    return;
  }

  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = history[i];
    const blackMove = history[i + 1] || "";
    const isEven = (moveNumber % 2 === 0);
    const rowBg = isEven ? 'rgba(255,255,255,0.02)' : 'transparent';

    const numDiv = document.createElement("div");
    numDiv.style.cssText = `color:#52525b; font-size:0.72rem; padding:2px 0; background:${rowBg};`;
    numDiv.innerText = `${moveNumber}.`;

    const whiteDiv = document.createElement("div");
    whiteDiv.style.cssText = `color:#e4e4e7; font-size:0.78rem; font-weight:600; padding:2px 0; background:${rowBg};`;
    whiteDiv.innerText = whiteMove;

    const blackDiv = document.createElement("div");
    blackDiv.style.cssText = `color:#a1a1aa; font-size:0.78rem; padding:2px 0; background:${rowBg};`;
    blackDiv.innerText = blackMove;

    historyElement.appendChild(numDiv);
    historyElement.appendChild(whiteDiv);
    historyElement.appendChild(blackDiv);
  }

  // Scroll to bottom
  const scrollContainer = document.getElementById("move-history");
  if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
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
  const gameOverModal = document.getElementById("game-over-modal");
  if (gameOverModal) {
    gameOverModal.style.display = "none";
  }
});

socket.on("timerUpdate", function (timers) {
  updateTimerDisplay("white-timer", timers.w);
  updateTimerDisplay("black-timer", timers.b);
});

socket.on("move", function (move) {
  chess.move(move);
});

socket.on("moveHistory", function (history) {
  moveHistoryData = history;
  renderMoveHistory();
});

const updateTimerDisplay = (id, seconds) => {
  const element = document.getElementById(id);
  if (!element) return;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  element.innerText = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (seconds < 30) {
    element.style.color = '#ef4444';
    element.style.animation = 'pulse 1s cubic-bezier(0.4,0,0.6,1) infinite';
  } else {
    element.style.color = '';
    element.style.animation = '';
  }
};

socket.on("game_over", function (message) {
  document.getElementById("winner-message").innerText = message;
  // Support both old style (display:flex) and new class-based modal
  const modal = document.getElementById("game-over-modal");
  modal.style.display = "flex";
  modal.classList.add("show");

  const pieces = document.querySelectorAll(".piece");
  pieces.forEach(piece => {
    piece.draggable = false;
  });
});

window.resetGame = () => {
    socket.emit("resetGame");
};

renderBoard();

// ─── Mobile Touch Support ─────────────────────────────────────────
// HTML5 drag/drop doesn't work on mobile. This adds touch-based dragging.
(function () {
  let touchPiece = null;
  let touchSource = null;
  let touchClone = null;

  boardElement.addEventListener("touchstart", function (e) {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target) return;

    const piece = target.closest(".piece");
    if (!piece || !piece.draggable) return;

    e.preventDefault();
    const square = piece.closest(".square");
    touchSource = {
      row: parseInt(square.dataset.row),
      col: parseInt(square.dataset.col),
    };
    touchPiece = piece;

    // Create a visual clone that follows the finger
    touchClone = piece.cloneNode(true);
    touchClone.style.position = "fixed";
    touchClone.style.pointerEvents = "none";
    touchClone.style.zIndex = "1000";
    touchClone.style.opacity = "0.85";
    touchClone.style.fontSize = piece.style.fontSize || "clamp(18px, 4.5vw, 42px)";
    touchClone.style.transform = playerRole === "b" ? "rotate(180deg)" : "none";
    touchClone.style.left = touch.clientX - 24 + "px";
    touchClone.style.top = touch.clientY - 24 + "px";
    document.body.appendChild(touchClone);

    piece.style.opacity = "0.3";
  }, { passive: false });

  boardElement.addEventListener("touchmove", function (e) {
    if (!touchClone) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchClone.style.left = touch.clientX - 24 + "px";
    touchClone.style.top = touch.clientY - 24 + "px";
  }, { passive: false });

  boardElement.addEventListener("touchend", function (e) {
    if (!touchSource || !touchClone) {
      cleanup();
      return;
    }

    const touch = e.changedTouches[0];
    // Temporarily hide clone to find element beneath
    touchClone.style.display = "none";
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    touchClone.style.display = "";

    if (dropTarget) {
      const square = dropTarget.closest(".square");
      if (square) {
        const targetSquare = {
          row: parseInt(square.dataset.row),
          col: parseInt(square.dataset.col),
        };
        handleMove(touchSource, targetSquare);
      }
    }

    cleanup();
  });

  function cleanup() {
    if (touchPiece) touchPiece.style.opacity = "1";
    if (touchClone && touchClone.parentNode) touchClone.parentNode.removeChild(touchClone);
    touchPiece = null;
    touchSource = null;
    touchClone = null;
  }
})();
