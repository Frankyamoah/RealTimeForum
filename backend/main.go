package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	realtimeforum "livechat-system/backend/models"
	service "livechat-system/backend/services"
	websocket "livechat-system/backend/websocket"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dgrijalva/jwt-go"
	_ "github.com/mattn/go-sqlite3"
)

// Global variables
var (
	db           *sql.DB
	forumService *service.ForumService
	secretKey    = generateSecretKey()
)

type CustomClaims struct {
	UserID int `json:"user_id"`
	jwt.StandardClaims
}

func init() {
	var err error
	db, err = sql.Open("sqlite3", "db/forumDB.sqlite")
	if err != nil {
		panic(err)
	}

}

func cleanupInactiveUsers(db *sql.DB) {
	// SQL query to delete inactive users
	query := `
    DELETE FROM online_users
    WHERE last_activity < DATETIME('now', '-30 minutes');
    `
	_, err := db.Exec(query)
	if err != nil {
		log.Fatalf("Failed to cleanup inactive users: %v", err)
	}
	log.Println("Inactive users cleanup completed successfully.")
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")                                // Allow all origins
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS") // Allow specific methods
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")     // Allow headers such as 'Content-Type' and 'Authorization'
}

func main() {
	// Set up database connection
	var err error
	db, err = sql.Open("sqlite3", "db/forumDB.sqlite")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
		return
	}

	// Ensure the database connection is alive
	err = db.Ping()
	if err != nil {
		log.Fatalf("Failed to connect to the database: %v", err)
		return
	}

	// Initialize the forumService with the database
	forumService = service.NewForumService(db)
	if forumService == nil {
		log.Fatalf("Failed to initialize ForumService")
	}

	// Initialize WebSocket server with forumService and db
	wsServer := websocket.NewWebSocketServer(db, forumService, secretKey)
	if wsServer == nil {
		log.Fatalf("Failed to initialize WebSocketServer")
	}

	// Start broadcasting user statuses periodically in a separate goroutine
	// go wsServer.BroadcastUserStatusesPeriodically()
	// Start the HTTP server
	setupHTTPServer(wsServer)

	// Call the cleanup function periodically
	ticker := time.NewTicker(1 * time.Hour) // Adjust the duration according to your needs
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cleanupInactiveUsers(db)
		}
	}
}

func setupHTTPServer(wsServer *websocket.WebSocketServer) {
	// CORS configuration
	allowedHeaders := "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization,X-CSRF-Token"
	allowedMethods := "GET, POST, PUT, DELETE, OPTIONS"

	// CORS middleware
	corsHandler := func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", allowedHeaders)
			w.Header().Set("Access-Control-Allow-Methods", allowedMethods)
			if r.Method == "OPTIONS" {
				return
			}
			h.ServeHTTP(w, r)
		})
	}

	// Configure routes
	http.HandleFunc("/users", Users)
	http.HandleFunc("/login", LoginRouteHandler(wsServer)) // Wrap the login function with WebSocket server
	http.HandleFunc("/register", Register)
	http.HandleFunc("/newpost", jwtMiddleware(NewPost))
	http.HandleFunc("/posts", jwtMiddleware(Posts))
	http.HandleFunc("/ws", wsServer.HandleConnections)
	http.HandleFunc("/chat-history", chatHistoryHandler)

	// Start the server
	port := ":8080"
	fmt.Printf("Server listening on port %s\n", port)
	log.Fatal(http.ListenAndServe(port, corsHandler(http.DefaultServeMux)))
}

func AuthenticateUser(db *sql.DB, username string, password string) (int64, string, error) {
	var storedPassword string
	var userID int64
	query := "SELECT user_id, password FROM Users WHERE username = ?"
	err := db.QueryRow(query, username).Scan(&userID, &storedPassword)
	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("User not found for username:", username)
			return 0, "", nil // Handle user not found scenario
		}
		fmt.Println("Error fetching user details:", err)
		return 0, "", err // Handle other DB-related errors
	}

	// Print retrieved values for debugging
	fmt.Println("Retrieved stored password:", storedPassword)
	fmt.Println("Input username:", username)

	if password != storedPassword {
		return 0, "", nil // Passwords don't match
	}
	fmt.Println(userID)
	return userID, username, nil // User authenticated successfully
}

func generateSecretKey() string {
	// Generate a 32-byte random key
	key := make([]byte, 32)
	_, err := rand.Read(key)
	if err != nil {
		panic("Error generating random key")
	}

	// Encode the key to base64 for use as a string
	return base64.URLEncoding.EncodeToString(key)
}

func Users(w http.ResponseWriter, r *http.Request) {
	// Assuming forumService is initialized in your main function
	users, err := forumService.GetAllUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(users); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func Login(w http.ResponseWriter, r *http.Request, server *websocket.WebSocketServer) {

	// Enable CORS for this request
	enableCors(&w)

	// Handle preflight OPTIONS request
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Log the action for debugging purposes
	fmt.Println("Login attempt")

	// Parse the username and password from the request body
	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	isValidUser, username, err := AuthenticateUser(db, credentials.Username, credentials.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if isValidUser == 0 {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	// Update user last activity
	if err := forumService.UpdateUserLastActivity(db, isValidUser); err != nil {
		log.Printf("Failed to update last activity for user %d: %v", isValidUser, err)
		http.Error(w, "Failed to update user activity", http.StatusInternalServerError)
		return
	}

	// Generate a JWT token
	token := jwt.New(jwt.SigningMethodHS256)
	claims := CustomClaims{
		UserID: int(isValidUser),
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: time.Now().Add(time.Hour * 24).Unix(),
		},
	}

	token.Claims = claims

	token.Claims.Valid()

	tokenString, err := token.SignedString([]byte(secretKey))
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}
	fmt.Println("intial token on login ", tokenString)

	// Respond with the token
	response := map[string]interface{}{
		"token":    tokenString,
		"username": username,
		"userId":   isValidUser, // include this to directly send userId
	}

	log.Printf("Login response: %+v", response) // Add this line to log the response

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// This function is used for routing setup, wrapping the Login function with access to the WebSocket server.
func LoginRouteHandler(server *websocket.WebSocketServer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		Login(w, r, server)
	}
}

func Register(w http.ResponseWriter, r *http.Request) {

	// Parse the username and password from the request body

	fmt.Println("connected")

	var newUser realtimeforum.User
	err := json.NewDecoder(r.Body).Decode(&newUser)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	response := map[string]string{"message": "User registered successfully"}
	json.NewEncoder(w).Encode(response)
	fmt.Println("new user:", newUser)
	forumService.CreateUser(newUser)
}

func Posts(w http.ResponseWriter, r *http.Request) {
	posts, err := forumService.GetAllPosts()
	if err != nil {
		http.Error(w, "error retrieving all posts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(posts); err != nil {
		http.Error(w, "error encoding json", http.StatusInternalServerError)
		return
	}
}

func NewPost(w http.ResponseWriter, r *http.Request) {

	tokenString := r.Header.Get("Authorization")
	if tokenString == "" {
		http.Error(w, "Unauthroized", http.StatusUnauthorized)
		return
	}
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(secretKey), nil
	})

	if err != nil {
		http.Error(w, "error parsing with claims", http.StatusInternalServerError)
		return
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok || !token.Valid {
		http.Error(w, "Invalid Token", http.StatusUnauthorized)
		return
	}

	//fmt.Println("token claims:", claims)

	userID := claims.UserID
	var newPost realtimeforum.Posts
	err = json.NewDecoder(r.Body).Decode(&newPost)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	newPost.UserID = userID
	forumService.CreatePost(newPost)

	// Update last activity
	if err := forumService.UpdateUserLastActivity(db, int64(userID)); err != nil {
		log.Printf("Failed to update last activity for user %d after posting: %v", userID, err)
	}

	response := map[string]string{"message": "new post created successfully"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	fmt.Println("new post:", newPost)
}

// Creates a middleware function for jwt authentication
func jwtMiddleware(next http.HandlerFunc) http.HandlerFunc {
	// Return a new function that conforms to http.HandlerFunc
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract the Authorization header from the request
		authorizationHeader := r.Header.Get("Authorization")
		// If the Authorization header is missing, return an error
		if authorizationHeader == "" {
			http.Error(w, "Authorization header is required", http.StatusUnauthorized)
			return
		}
		// Remove the "Bearer " prefix from the Authorization header
		tokenString := strings.TrimPrefix(authorizationHeader, "Bearer ")
		// Parse the JWT token into a token object, using a callback function to validate the token
		//&CustomClaims{} indicates that the token shoud be mapped to the CustomClaims struct
		token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(secretKey), nil
		})

		// If parsing the token resulted in an error, or if the token is invalid return an error
		if err != nil || !token.Valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "Invalid token"})

			http.Error(w, `{"message": "Authorization header is required"}`, http.StatusUnauthorized)
			return
		}
		// If the token is valid proceed with the next handler in the chain
		// The next handler is passed as an argument to the middleware function
		// allowing the request to contine through the chain only if the jwt token is valid
		next.ServeHTTP(w, r)

	}
}

func chatHistoryHandler(w http.ResponseWriter, r *http.Request) {
	senderIDStr := r.URL.Query().Get("senderId")
	receiverIDStr := r.URL.Query().Get("receiverId")

	senderID, err := strconv.ParseInt(senderIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid sender ID", http.StatusBadRequest)
		return
	}

	receiverID, err := strconv.ParseInt(receiverIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid receiver ID", http.StatusBadRequest)
		return
	}

	history, err := forumService.GetChatHistory(senderID, receiverID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch chat history: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(history); err != nil {
		http.Error(w, "Failed to encode chat history", http.StatusInternalServerError)
	}
}
