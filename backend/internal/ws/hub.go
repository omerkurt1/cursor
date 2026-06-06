package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omerkurt1/cursor/backend/internal/model"
)

var upgrader = websocket.Upgrader{
	HandshakeTimeout: 5 * time.Second,
	ReadBufferSize:   512,
	WriteBufferSize:  1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS is handled at the chi layer
	},
}

type client struct {
	send chan []byte
	hub  *Hub
	conn *websocket.Conn
}

// Hub manages all WebSocket connections and fan-out broadcasting.
type Hub struct {
	mu         sync.RWMutex
	clients    map[*client]struct{}
	broadcast  chan model.WsEvent
	register   chan *client
	unregister chan *client
}

func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[*client]struct{}),
		broadcast:  make(chan model.WsEvent, 64),
		register:   make(chan *client, 8),
		unregister: make(chan *client, 8),
	}
	go h.run()
	return h
}

func (h *Hub) run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()

		case ev := <-h.broadcast:
			payload, err := json.Marshal(ev)
			if err != nil {
				slog.Error("ws marshal error", "err", err)
				continue
			}
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.send <- payload:
				default:
					// slow client — drop rather than block
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast sends an event to all connected WebSocket clients.
func (h *Hub) Broadcast(ev model.WsEvent) {
	h.broadcast <- ev
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade error", "err", err)
		return
	}

	c := &client{
		send: make(chan []byte, 32),
		hub:  h,
		conn: conn,
	}
	h.register <- c

	go c.writePump()
	go c.readPump()
}

func (c *client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
