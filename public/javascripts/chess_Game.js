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

// Selection and Tap-to-move State Variables
let selectedSquare = null;   // { row, col }
let validMoveSquares = [];   // array of { row, col }

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

  applySelectionHighlights();
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

// ─── Selection Highlight Helpers ─────────────────────────────────────
const clearSelection = () => {
    selectedSquare = null;
    validMoveSquares = [];
    renderBoard(); // re-render handles clearing CSS classes
};

const applySelectionHighlights = () => {
    if (!selectedSquare) return;

    // Highlight the selected square
    const selSquareEl = document.querySelector(`.square[data-row="${selectedSquare.row}"][data-col="${selectedSquare.col}"]`);
    if (selSquareEl) {
        selSquareEl.classList.add("selected-square");
    }

    // Highlight valid moves
    validMoveSquares.forEach(sq => {
        const targetSquareEl = document.querySelector(`.square[data-row="${sq.row}"][data-col="${sq.col}"]`);
        if (targetSquareEl) {
            // Check if there is an opponent piece to capture (for ring indicator)
            const targetPiece = chess.board()[sq.row][sq.col];
            if (targetPiece) {
                targetSquareEl.classList.add("valid-move-capture");
            } else {
                targetSquareEl.classList.add("valid-move-dot");
            }
        }
    });
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

// ─── Hybrid Interaction (Pointer Events) ─────────────────────────
// Handles Tap-to-move (+ Touch-drag) for touch devices, leaves HTML5 drag for desktop.
(function () {
  let touchClone = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  const DRAG_THRESHOLD = 6;
  let longPressTimer = null;

  boardElement.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return; // Let HTML5 handle mouse
    
    // Check if the game is over
    const gameOverModal = document.getElementById("game-over-modal");
    if (gameOverModal && gameOverModal.style.display !== "none") return;

    // Prevent default scroll behavior
    e.preventDefault();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target) return;
    
    const square = target.closest(".square");
    if (!square) {
        clearSelection();
        return;
    }

    const rowIndex = parseInt(square.dataset.row);
    const colIndex = parseInt(square.dataset.col);
    const pieceEl = square.querySelector(".piece");

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    isDragging = false;

    // Is there a selection already? Check if tapping a valid move square
    if (selectedSquare) {
        const isMoveTarget = validMoveSquares.some(sq => sq.row === rowIndex && sq.col === colIndex);
        if (isMoveTarget) {
            const targetSquare = { row: rowIndex, col: colIndex };
            handleMove(selectedSquare, targetSquare);
            clearSelection();
            return;
        }

        // Tapping another piece of our own? Switch selection
        if (pieceEl && pieceEl.draggable) {
            selectPiece(rowIndex, colIndex, pieceEl, target);
        } else {
            // Tapping somewhere invalid -> clear
            clearSelection();
        }
    } else {
        // No selection, tap on piece to select
        if (pieceEl && pieceEl.draggable) {
            selectPiece(rowIndex, colIndex, pieceEl, target);
            
            // Setup for potential drag
            touchSource = { row: rowIndex, col: colIndex };
            touchPiece = pieceEl;
        }
    }
  });

  // Calculate valid moves purely off chess.js
  function selectPiece(r, c, pieceEl, target) {
      const fromAlgebraic = `${String.fromCharCode(97 + c)}${8 - r}`;
      const legalMoves = chess.moves({ square: fromAlgebraic, verbose: true });
      
      selectedSquare = { row: r, col: c };
      validMoveSquares = legalMoves.map(m => {
          // 'to' is like 'e4'
          const targetCol = m.to.charCodeAt(0) - 97;
          const targetRow = 8 - parseInt(m.to[1]);
          return { row: targetRow, col: targetCol };
      });
      renderBoard(); // re-applies highlights
  }

  boardElement.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "touch") return; // Let HTML5 drag handle mouse
    if (!selectedSquare || !touchPiece) return;
    
    // Check if movement passed threshold to trigger dragging
    if (!isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          isDragging = true;
          document.body.classList.add("dragging");
          touchPiece.style.opacity = "0.3";

          // Create clone
          touchClone = touchPiece.cloneNode(true);
          touchClone.style.position = "fixed";
          touchClone.style.pointerEvents = "none";
          touchClone.style.zIndex = "1000";
          touchClone.style.opacity = "0.85";
          touchClone.style.fontSize = touchPiece.style.fontSize || "clamp(18px, 4.5vw, 42px)";
          touchClone.style.transform = playerRole === "b" ? "rotate(180deg)" : "none";
          document.body.appendChild(touchClone);
      }
    }
    
    if (isDragging && touchClone) {
        touchClone.style.left = e.clientX - 24 + "px";
        touchClone.style.top = e.clientY - 24 + "px";
    }
  });

  boardElement.addEventListener("pointerup", function (e) {
    if (e.pointerType !== "touch") return;

    if (isDragging) {
        // Was dragging, handle drop
        if (touchClone) {
            touchClone.style.display = "none";
            const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
            touchClone.style.display = "";

            if (dropTarget) {
                const square = dropTarget.closest(".square");
                if (square) {
                    const row = parseInt(square.dataset.row);
                    const col = parseInt(square.dataset.col);
                    
                    // Check if it's a valid move (using our array)
                    const isValidMove = validMoveSquares.some(sq => sq.row === row && sq.col === col);
                    
                    if (isValidMove) {
                        handleMove(touchSource, { row, col });
                    }
                }
            }
        }
        clearSelection(); // Drop finishes selection
        cleanupDrag();
    }
    // If not dragging, tap logic handled it in pointerdown
  });

  boardElement.addEventListener("pointercancel", function(e) {
      if (e.pointerType !== "touch") return;
      cleanupDrag();
  });

  let touchSource = null;
  let touchPiece = null;

  function cleanupDrag() {
    isDragging = false;
    document.body.classList.remove("dragging");
    if (touchPiece) touchPiece.style.opacity = "1";
    if (touchClone && touchClone.parentNode) touchClone.parentNode.removeChild(touchClone);
    touchSource = null;
    touchPiece = null;
    touchClone = null;
  }
})();
