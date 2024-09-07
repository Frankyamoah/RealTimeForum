CREATE TABLE IF NOT EXISTS Users (
user_id INTEGER PRIMARY KEY AUTOINCREMENT,
nickname TEXT UNIQUE NOT NULL,
age INT NOT NULL,
gender TEXT NOT NULL,
first_name TEXT NOT NULL,
last_name TEXT NOT NULL,
email TEXT UNIQUE NOT NULL,
password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Posts (
post_id INTEGER PRIMARY KEY AUTOINCREMENT,                             
author_id INTEGER NOT NULL,
title TEXT NOT NULL,                   
content TEXT NOT NULL,
category_id INTEGER NOT NULL,
created_at TIMESTAMP NOT NULL, 
FOREIGN KEY (author_id) REFERENCES Users(user_id), 
FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE TABLE IF NOT EXISTS Comments (
comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
author_id INTEGER NOT NULL, 
post_id INTEGER NOT NULL,
content TEXT NOT NULL,
created_at TIMESTAMP NOT NULL, 
FOREIGN KEY (author_id) REFERENCES Users(user_id),
FOREIGN KEY (post_id) REFERENCES Post(post_id)
);

CREATE TABLE IF NOT EXISTS Likes (
like_id INTEGER PRIMARY KEY AUTOINCREMENT, 
user_id INTEGER NOT NULL,         
post_id INTEGER NOT NULL,          
FOREIGN KEY (user_id) REFERENCES Users(user_id),
FOREIGN KEY (post_id) REFERENCES Post(post_id)
);


CREATE TABLE IF NOT EXISTS Categories (
category_id INTEGER PRIMARY KEY  AUTOINCREMENT, 
category Name TEXT 
);

CREATE TABLE IF NOT EXISTS Post_Category(
post_id INTEGER NOT NULL, 
category_id INTEGER NOT NULL, 
FOREIGN KEY (post_id) REFERENCES Posts(post_id),
FOREIGN KEY (category_id) REFERENCES Categories(category_id)
);

CREATE TABLE IF NOT EXISTS Chats (
message_id INTEGER PRIMARY KEY AUTOINCREMENT, 
sender_id INTEGER NOT NULL, 
receiver_id INTEGER NOT NULL, 
message Content TEXT NOT NULL,
sent_at TIMESTAMP NOT NULL, 
FOREIGN KEY (sender_id) REFERENCES Users(user_id),
FOREIGN KEY (receiver_id) REFERENCES Users(user_id)
);


CREATE TABLE IF NOT EXISTS Online_Users(
user_id INTEGER NOT NULL, 
Last_Activity_Time TIMESTAMP NOT NULL
);
