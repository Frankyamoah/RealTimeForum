package realtimeforum

import "time"

// User represents the Users table in the database
type User struct {
	UserID    int    `json:"user_id"`
	Username  string `json:"username"`
	Age       int    `json:"age"`
	Gender    string `json:"gender"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"password"`
}

// Post represents the Posts table in the database
type Posts struct {
	PostID     int       `json:"post_id"`
	UserID     int       `json:"user_id"`
	Title      string    `json:"post_title"`
	Content    string    `json:"post_content"`
	CategoryID int       `json:"category_id"`
	CreatedAt  time.Time `json:"created_at"`
}

// Comment represents the Comments table in the database
type Comments struct {
	CommentID int       `json:"comment_id"`
	AuthorID  int       `json:"author_id"`
	PostID    int       `json:"post_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// Like represents the Likes table in the database
type Like struct {
	LikeID int `json:"like_id"`
	UserID int `json:"user_id"`
	PostID int `json:"post_id"`
}

// Category represents the Categories table in the database
type Category struct {
	CategoryID int    `json:"category_id"`
	Category   string `json:"category"`
}

// PostCategory represents the Post_Category table in the database
type PostCategory struct {
	PostID     int `json:"post_id"`
	CategoryID int `json:"category_id"`
}

// Chat represents the Chats table in the database
type Chats struct {
	MessageID      int       `json:"message_id"`
	SenderID       int       `json:"sender_id"`
	ReceiverID     int       `json:"receiver_id"`
	MessageContent string    `json:"message_content"`
	SentAt         time.Time `json:"sent_at"`
	SenderUsername string    `json:"senderUsername"`
}

// OnlineUser represents the Online_Users table in the database
type OnlineUsers struct {
	UserID           int       `json:"user_id"`
	LastActivityTime time.Time `json:"last_activity_time"`
}

// Message struct consolidates WebSocket message structure with necessary user and message info.
type Message struct {
	Type           string       `json:"type"`                     // Type of message (e.g., "chat", "notification")
	SenderID       int64        `json:"senderId,omitempty"`       // For identifying the sender
	SenderUsername string       `json:"senderUsername,omitempty"` // For displaying to users (filled server-side)
	ReceiverID     int64        `json:"receiverId,omitempty"`     // For routing the message (client-side may leave blank for broadcasts)
	Message        string       `json:"message"`                  // The actual message content
	SentAt         time.Time    `json:"sentAt,omitempty"`         // Timestamp (can be set server-side)
	OnlineUsers    []UserStatus `json:"onlineUsers,omitempty"`    // List of online users' usernames
}

type UserStatus struct {
	UserID   int64  `json:"userId"` // UserID to identify the user uniquely
	Username string `json:"username"`
	IsOnline bool   `json:"isOnline"`
}
