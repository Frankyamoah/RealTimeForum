package service

import (
	"database/sql"
	"fmt"
	realtimeforum "livechat-system/backend/models"
	"log"
	"runtime/debug"
	"time"
)

type ForumService struct {
	DB *sql.DB
}

func NewForumService(db *sql.DB) *ForumService {
	return &ForumService{DB: db}
}

func (fs *ForumService) GetAllUsers() ([]realtimeforum.User, error) {
	rows, err := fs.DB.Query("SELECT * FROM Users")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []realtimeforum.User
	for rows.Next() {
		var user realtimeforum.User
		err := rows.Scan(&user.UserID, &user.Username, &user.Age, &user.Gender, &user.FirstName, &user.LastName, &user.Email, &user.Password)
		if err != nil {
			return nil, err
		}
		fmt.Println(user, users)
		users = append(users, user)

	}

	return users, nil
}

// GetUserIDByUsername returns the user ID for a given username.
// Returns an error if the user cannot be found or there's a database issue.
func (fs *ForumService) GetUserIDByUsername(username string) (int64, error) {
	var userID int64
	query := "SELECT user_id FROM Users WHERE username = ? LIMIT 1"

	err := fs.DB.QueryRow(query, username).Scan(&userID)
	if err != nil {
		return 0, err // Could be sql.ErrNoRows if the user is not found, or another error if there's a problem with the database
	}

	return userID, nil
}

func (fs *ForumService) GetUsernameByID(userID int64) (string, error) {
	var username string
	query := "SELECT username FROM Users WHERE user_id = ? LIMIT 1"

	err := fs.DB.QueryRow(query, userID).Scan(&username)
	if err != nil {
		return "", err
	}

	return username, nil

}

func (fs *ForumService) CreateUser(newUser realtimeforum.User) (int64, error) {
	//stmt to insert new user
	query := "INSERT INTO Users(username, age, gender, first_name, last_name, email, password) VALUES (?,?,?,?,?,?,?)"

	//execute stmt
	result, err := fs.DB.Exec(query, newUser.Username, newUser.Age, newUser.Gender, newUser.FirstName, newUser.LastName, newUser.Email, newUser.Password)
	if err != nil {
		return 0, err
	}

	//get id of nee registered user
	userID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	fmt.Println(userID)
	return userID, nil
}

func (fs *ForumService) CreatePost(newPost realtimeforum.Posts) (int64, error) {
	query := "INSERT INTO Posts(user_id, title, content, category_id, created_at) VALUES (?,?,?,?,?)"

	result, err := fs.DB.Exec(query, newPost.UserID, newPost.Title, newPost.Content, newPost.CategoryID, newPost.CreatedAt)
	if err != nil {
		return 0, err
	}

	postID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	return postID, nil
}

func (fs *ForumService) GetPostByID(postID int) (*realtimeforum.Posts, error) {
	query := `
    SELECT 
        p.post_id, 
        p.user_id, 
        p.title, 
        p.content, 
        p.category_id,
        p.created_at, 
        COUNT(c.comment_id) AS comment_count,
        u.username
    FROM 
        Posts p
    LEFT JOIN 
        Comments c ON p.post_id = c.post_id
    JOIN
        Users u ON p.user_id = u.user_id
    WHERE
        p.post_id = ?
    GROUP BY 
        p.post_id
    `
	row := fs.DB.QueryRow(query, postID)
	var post realtimeforum.Posts
	err := row.Scan(&post.PostID, &post.UserID, &post.Title, &post.Content, &post.CategoryID, &post.CreatedAt, &post.CommentCount, &post.Username)
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (fs *ForumService) GetAllPosts() ([]realtimeforum.Posts, error) {
	query := `
    SELECT 
        p.post_id, 
        p.user_id, 
        p.title, 
        p.content, 
        p.created_at, 
        COUNT(c.comment_id) AS comment_count,
        u.username
    FROM 
        Posts p
    LEFT JOIN 
        Comments c ON p.post_id = c.post_id
    JOIN
        Users u ON p.user_id = u.user_id
    GROUP BY 
        p.post_id
    ORDER BY 
        p.created_at DESC;
    `

	rows, err := fs.DB.Query(query)
	if err != nil {
		log.Printf("Error executing query in GetAllPosts: %v", err)
		return nil, err
	}
	defer rows.Close()

	var posts []realtimeforum.Posts
	for rows.Next() {
		var post realtimeforum.Posts
		err := rows.Scan(&post.PostID, &post.UserID, &post.Title, &post.Content, &post.CreatedAt, &post.CommentCount, &post.Username)
		if err != nil {
			log.Printf("Error scanning row in GetAllPosts: %v", err)
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, nil
}

func (fs *ForumService) SaveChatMessage(chat realtimeforum.Chats) error {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered from panic in SaveChatMessage: %v", r)
			debug.PrintStack()
		}
	}()

	// Log the chat message details before attempting to save
	log.Printf("Saving chat message: %+v", chat)

	// Check for valid database connection
	if fs.DB == nil {
		err := fmt.Errorf("database connection is nil")
		log.Printf("Error: %v", err)
		return err
	}

	// SQL query to insert new chat message
	query := "INSERT INTO Chats(sender_id, receiver_id, message, sent_at, sender_username) VALUES (?,?,?,?,?)"

	// Executing the query with the chat details
	_, err := fs.DB.Exec(query, chat.SenderID, chat.ReceiverID, chat.MessageContent, chat.SentAt.Format(time.RFC3339), chat.SenderUsername)
	if err != nil {
		log.Printf("Error executing query: %v", err)
		return err
	}

	// Log successful message save
	log.Printf("Chat message saved successfully")

	// Return no error
	return nil
}

// forum.service.go

func (fs *ForumService) GetChatHistory(senderID, receiverID int64, limit, offset int) ([]realtimeforum.Chats, error) {
	// SQL query to fetch chat history between two users
	query := `
    SELECT c.message_id, c.sender_id, c.receiver_id, c.message, c.sent_at, u.username 
    FROM Chats c
    JOIN Users u ON c.sender_id = u.user_id
    WHERE (c.sender_id = ? AND c.receiver_id = ?) OR (c.sender_id = ? AND c.receiver_id = ?)
    ORDER BY c.sent_at DESC
    LIMIT ? OFFSET ?
    `
	// Pass all required arguments to the query
	rows, err := fs.DB.Query(query, senderID, receiverID, receiverID, senderID, limit, offset)
	if err != nil {
		log.Printf("Error executing query in GetChatHistory: %v", err)
		return nil, err
	}
	defer rows.Close()

	// Create a slice of chats to store the chat history
	var chats []realtimeforum.Chats
	for rows.Next() {
		var chat realtimeforum.Chats
		var sentAt string
		err := rows.Scan(&chat.MessageID, &chat.SenderID, &chat.ReceiverID, &chat.MessageContent, &sentAt, &chat.SenderUsername)
		if err != nil {
			log.Printf("Error scanning row in GetChatHistory: %v", err)
			return nil, err
		}
		// Parse the sentAt time
		chat.SentAt, err = time.Parse(time.RFC3339, sentAt)
		if err != nil {
			log.Printf("Error parsing sentAt: %v", err)
			return nil, err
		}
		chats = append(chats, chat)
	}
	return chats, nil
}

// UpdateUserLastActivity updates the last_activity timestamp for a user in the online_users table.
func (fs *ForumService) UpdateUserLastActivity(db *sql.DB, userID int64) error {
	// Prepare the SQL statement for upserting last activity
	query := `
    INSERT INTO online_users (user_id, last_activity) VALUES (?, CURRENT_TIMESTAMP)
ON CONFLICT(user_id) DO UPDATE SET last_activity = CURRENT_TIMESTAMP;
    `
	_, err := db.Exec(query, userID)
	if err != nil {
		return err
	}
	return nil
}

// GetCommentsByPostID retrieves all comments for a given post
func (s *ForumService) GetCommentsByPostID(postID int) ([]realtimeforum.Comments, error) {
	rows, err := s.DB.Query("SELECT comment_id, author_id, post_id, content, created_at FROM Comments WHERE post_id = ? ORDER BY created_at DESC", postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []realtimeforum.Comments
	for rows.Next() {
		var comment realtimeforum.Comments
		if err := rows.Scan(&comment.CommentID, &comment.AuthorID, &comment.PostID, &comment.Content, &comment.CreatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}

	return comments, nil
}

// AddComment inserts a new comment into the database
func (s *ForumService) AddComment(comment realtimeforum.Comments) error {
	_, err := s.DB.Exec("INSERT INTO Comments (author_id, post_id, content, created_at) VALUES (?, ?, ?, ?)", comment.AuthorID, comment.PostID, comment.Content, comment.CreatedAt)
	return err
}
