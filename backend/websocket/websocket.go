package websocket

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"sync"
	"time"

	realtimeforum "livechat-system/backend/models"
	service "livechat-system/backend/services"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/websocket"
)

// WebSocketServer represents the WebSocket server.
type WebSocketServer struct {
	DB              *sql.DB
	ForumService    *service.ForumService
	SecretKey       string
	clients         map[*websocket.Conn]int64 // Map to track all connected WebSocket clients
	onlineUsers     map[int64]bool            // Map to track online users
	clientsMutex    sync.Mutex
	userStatusMutex sync.Mutex
}

// NewWebSocketServer creates a new instance of WebSocketServer with dependencies injected.
func NewWebSocketServer(db *sql.DB, forumService *service.ForumService, secretKey string) *WebSocketServer {
	if forumService == nil {
		log.Fatalf("ForumService is nil")
	}
	return &WebSocketServer{
		DB:              db,
		ForumService:    forumService,
		SecretKey:       secretKey,
		clients:         make(map[*websocket.Conn]int64),
		onlineUsers:     make(map[int64]bool),
		userStatusMutex: sync.Mutex{},
	}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type CustomClaims struct {
	UserID int `json:"user_id"`
	jwt.StandardClaims
}

// HandleConnections manages incoming WebSocket connections, enforcing JWT token validation.
func (server *WebSocketServer) HandleConnections(w http.ResponseWriter, r *http.Request) {
	log.Printf("New WebSocket connection attempt from %s", r.RemoteAddr)

	// Extract JWT token from query parameters.
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		log.Println("JWT token is missing")
		http.Error(w, "JWT token is missing", http.StatusUnauthorized)
		return
	}

	// Validate JWT token.
	claims, err := server.validateToken(tokenString)
	if err != nil {
		log.Printf("Invalid token: %v\n", err)
		http.Error(w, "Invalid JWT token", http.StatusUnauthorized)
		return
	}

	// At this point, the token is valid.
	userID := claims.UserID
	log.Printf("Authenticated user ID: %d\n", userID)

	// Proceed with WebSocket upgrade.
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket Upgrade error:", err)
		http.Error(w, "Failed to upgrade WebSocket connection", http.StatusInternalServerError)
		return
	}

	// Delegate the connection handling to another method
	server.handleClientConnection(conn, int64(claims.UserID))

}

func (server *WebSocketServer) validateToken(tokenString string) (*CustomClaims, error) {
	fmt.Println("token at Validation:", tokenString) // Log the token to inspect its format and completeness
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(server.SecretKey), nil
	})
	if err != nil {
		fmt.Println("Token validation error:", err) // More detailed error logging
		return nil, err
	}
	if claims, ok := token.Claims.(*CustomClaims); ok && token.Valid {
		return claims, nil
	} else {
		return nil, fmt.Errorf("invalid token")
	}
}

func (server *WebSocketServer) handleClientConnection(conn *websocket.Conn, userID int64) {
	// Ensure to handle client disconnection
	defer server.handleClientDisconnection(conn, userID)

	// Register new connection with the user's ID.
	server.clientsMutex.Lock()
	if server.clients == nil {
		server.clients = make(map[*websocket.Conn]int64)
	}
	server.clients[conn] = userID
	server.clientsMutex.Unlock()

	server.markUserOnline(userID)

	// Send the initial online users list to the new client
	server.sendOnlineUsersToClient(conn)

	// Broadcast to all other clients that a new user has connected
	server.broadcastUserStatusChange(userID, true)

	// Listen to messages from this connection
	server.listenToMessages(conn, userID)
}

func (server *WebSocketServer) sendOnlineUsersToClient(conn *websocket.Conn) {
	onlineUsers := server.getOnlineUsers()
	message := realtimeforum.Message{
		Type:        "onlineUsers",
		OnlineUsers: onlineUsers,
	}
	err := conn.WriteJSON(message)
	if err != nil {
		log.Printf("Error sending online users to client: %v", err)
	}
}

func (server *WebSocketServer) getOnlineUsers() []realtimeforum.UserStatus {
	server.userStatusMutex.Lock()
	defer server.userStatusMutex.Unlock()

	var onlineUsers []realtimeforum.UserStatus
	for userID := range server.onlineUsers {
		username, err := server.ForumService.GetUsernameByID(userID)
		if err != nil {
			log.Printf("Error getting username for user %d: %v", userID, err)
			continue
		}
		onlineUsers = append(onlineUsers, realtimeforum.UserStatus{
			UserID:   userID,
			Username: username,
			IsOnline: true,
		})
	}
	return onlineUsers
}

func (server *WebSocketServer) broadcastUserStatusChange(userID int64, isOnline bool) {
	username, err := server.ForumService.GetUsernameByID(userID)
	if err != nil {
		log.Printf("Error getting username for user %d: %v", userID, err)
		return
	}

	statusChangeMessage := realtimeforum.Message{
		Type: "userStatusChange",
		OnlineUsers: []realtimeforum.UserStatus{
			{UserID: userID, Username: username, IsOnline: isOnline},
		},
	}
	server.broadcastMessageToAllClients(statusChangeMessage)
}

func (server *WebSocketServer) listenToMessages(conn *websocket.Conn, userID int64) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered from panic in listenToMessages: %v", r)
			debug.PrintStack()
		}
		server.handleClientDisconnection(conn, userID)
	}()

	for {
		var msg realtimeforum.Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Error reading JSON: %v", err)
				debug.PrintStack()
			}
			break
		}

		log.Printf("Message from user %d: Type: %s", userID, msg.Type)

		switch msg.Type {
		case "private":
			if msg.ReceiverID != 0 {
				msg.SenderID = userID
				server.sendPrivateMessage(msg.SenderID, msg.ReceiverID, msg)
			} else {
				log.Printf("Invalid user IDs: SenderID %d, ReceiverID %d", msg.SenderID, msg.ReceiverID)
				conn.WriteJSON(map[string]string{"error": "Invalid user IDs provided"})
			}
		case "broadcast":
			// msg.SenderID = userID // Set the sender ID
			server.broadcastMessage(msg)
		case "onlineUsers":
			server.sendOnlineUsersToClient(conn)
		default:
			log.Printf("Unhandled message type: %s", msg.Type)
			conn.WriteJSON(map[string]string{"error": "Unhandled message type"})
		}
	}
}

func (server *WebSocketServer) handleClientDisconnection(conn *websocket.Conn, userID int64) {
	conn.Close()
	server.clientsMutex.Lock()
	delete(server.clients, conn)
	server.clientsMutex.Unlock()

	server.unmarkUserOnline(userID)

	// Broadcast to all clients that this user has disconnected
	server.broadcastUserStatusChange(userID, false)

	log.Printf("Client with user ID %d has disconnected", userID)
}

func (server *WebSocketServer) broadcastMessageToAllClients(message realtimeforum.Message) {
	log.Println("Broadcasting message to all connected clients...")
	acknowledged := false
	for client, userID := range server.clients {
		// Skip sending the message back to the sender
		if userID == message.SenderID {
			continue
		}
		if err := client.WriteJSON(message); err != nil {
			log.Printf("Error broadcasting to client: %v", err)
			client.Close()
			delete(server.clients, client)
		} else {
			acknowledged = true
		}
	}
	if acknowledged {
		log.Println("Broadcast message successfully sent to at least one client.")
	} else {
		log.Println("Failed to send broadcast message to any client.")
	}
}

func (server *WebSocketServer) broadcastMessage(message realtimeforum.Message) {
	message.Type = "broadcast"
	log.Printf("Initiating broadcast for message: %s", message.Message)
	server.broadcastMessageToAllClients(message)
}

func (server *WebSocketServer) sendPrivateMessage(senderID int64, receiverID int64, msg realtimeforum.Message) {

	server.clientsMutex.Lock()
	defer server.clientsMutex.Unlock()

	log.Printf("Attempting to send private message from %d to %d", senderID, receiverID)

	for conn, id := range server.clients {
		if id == receiverID {
			log.Printf("Matching client found for receiver ID %d", receiverID)

			outgoingMsg := realtimeforum.Message{
				Type:           "private",
				SenderID:       senderID,
				ReceiverID:     receiverID,
				Message:        msg.Message,
				SenderUsername: msg.SenderUsername,
				SentAt:         time.Now().UTC(), // Ensure the timestamp is set
			}

			if senderUsername, err := server.ForumService.GetUsernameByID(senderID); err == nil {
				outgoingMsg.SenderUsername = senderUsername
				log.Printf("Sender username set: %s", senderUsername)
			} else {
				log.Printf("Failed to retrieve sender username: %v", err)
			}

			// Send message to the receiver
			if err := conn.WriteJSON(outgoingMsg); err != nil {
				log.Printf("Error sending private message to user ID %d: %v", receiverID, err)
				server.clientsMutex.Lock()
				conn.Close()
				delete(server.clients, conn)
				server.clientsMutex.Unlock()
				debug.PrintStack()
				return
			}

			log.Printf("Private message sent successfully to user ID %d", receiverID)

			chat := realtimeforum.Chats{
				SenderID:       int(senderID),
				ReceiverID:     int(receiverID),
				MessageContent: msg.Message,
				SentAt:         outgoingMsg.SentAt,
				SenderUsername: outgoingMsg.SenderUsername,
			}

			if err := server.ForumService.SaveChatMessage(chat); err != nil {
				log.Printf("Error saving chat message: %v", err)
			}

			if err := server.ForumService.UpdateUserLastActivity(server.DB, senderID); err != nil {
				log.Printf("Failed to update last activity for user %d: %v", senderID, err)
			}
		}
	}

	log.Printf("Finished processing private message from %d to %d", senderID, receiverID)
}

// Helper function to determine if a user is currently marked online
func (server *WebSocketServer) isOnline(userID int64) bool {
	_, exists := server.onlineUsers[userID]
	return exists
}

func (server *WebSocketServer) markUserOnline(userID int64) {
	server.userStatusMutex.Lock()
	defer server.userStatusMutex.Unlock()
	server.onlineUsers[userID] = true
}

func (server *WebSocketServer) unmarkUserOnline(userID int64) {
	server.userStatusMutex.Lock()
	defer server.userStatusMutex.Unlock()
	delete(server.onlineUsers, userID)
}
