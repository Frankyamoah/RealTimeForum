import {jwtDecode} from './node_modules/jwt-decode/build/esm/index.js'
import {setupNav} from './index.js'
// Create a new div for the post container
const postContainer = document.createElement('div')
// Set the id of the post container to postcontainer
postContainer.setAttribute('id', 'postcontainer')

let ws; // Declare ws at a higher scope
let chatUIReady = false;
let messageQueue = [];
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_STORED_MESSAGES = 20; // 
let newMessageCount = 0;
let lastBroadcastTimestamp = 0;
const contentDiv = document.getElementById('content');
let chatHistoryOffset = 0;
const chatHistoryLimit = 10;
let hasMoreMessages = true
let isLoadingMessages = false;

function formatDate(isoDateString) {
    const date = new Date(isoDateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-based
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month}/${year} at ${hours}:${minutes}`;
}


// Fetches posts from backend and displays them on the forum page
async function createForumContent() {
    const token = localStorage.getItem('token'); // Ensure this line is within the function
    if (!token) {
        console.error("No token found. You must be logged in to view posts.");
        return; // Optionally, redirect to login page or display a message prompting login
    }
   try{
    const response = await fetch('http://localhost:8080/posts', {
        method : 'GET',
        headers : {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${token}`
        }
    })
    if (!response.ok) {
        throw new Error('Failed to fetch posts');
    }
    const postData = await response.json();
    console.log(postData);
    displayPostData(postData);
} catch (error) {
    console.error('Error fetching all posts', error);
}

}

function displayPostData(postData) {
    postContainer.innerHTML = '';

    // Loop through each post in the postData array (reversed to show the latest post first)
    postData.forEach(post => {
        const singlePost = document.createElement('div');
        singlePost.setAttribute('class', 'singlepost');
        
        const titleElement = document.createElement("h2");
        titleElement.textContent = `${post.post_title}`;
        titleElement.style.cursor = 'pointer'; // Change cursor to pointer
        titleElement.addEventListener('click', () => {
            viewPostWithComments(post.post_id);
        });

        // Display author (use the dynamically fetched username)
        const authorElement = document.createElement("p");
        authorElement.textContent = `By ${post.username}`; 
        
        const contentElement = document.createElement("p");
        contentElement.textContent = `${post.post_content}`;
        
        const createdAtElement = document.createElement("p");
        createdAtElement.textContent = `Posted on ${formatDate(post.created_at)}`;

        // Display the number of comments
        const commentsElement = document.createElement("p");
        commentsElement.textContent = `${post.comment_count || 0} comments`; 

        // Append the elements to the singlePost div
        singlePost.appendChild(titleElement);
        singlePost.appendChild(authorElement);
        singlePost.appendChild(contentElement);
        singlePost.appendChild(createdAtElement);
        singlePost.appendChild(commentsElement);

        postContainer.appendChild(singlePost);
    });

    contentDiv.appendChild(postContainer);
}







async function createProfileContent() {
    try{
       const response = await fetch('http://localhost:8080/users', {
           method : 'GET',
           headers : {
               'Content-Type' : 'application/json'
           }
       }) 
       if (!response.ok) {
           throw new Error('failed to fetch user data')
       }
 
       const userData = await response.json();
       
       displayUserData(userData)
       
   }catch(error) {
       console.error('error fetching user data:', error)
   }
 }


function displayUserData(userData) {
   const userContainer = document.createElement('div')

   userData.forEach(user => {
       const userElement = document.createElement('div')
       userElement.textContent = `username : ${user.username}, email: ${user.email}`
       userContainer.appendChild(userElement)
   })
   postContainer.appendChild(userContainer)
   contentDiv.appendChild(postContainer)
}




function logToLocalStorage(message) {
    if (message.includes('WebSocket message received: {"type":"onlineUsers"')) {
        // Don't store online user messages
        return;
    }

    let logs = JSON.parse(localStorage.getItem('chatLogs') || '[]');
    logs.push(message);
    
    // Keep only the last MAX_STORED_MESSAGES
    if (logs.length > MAX_STORED_MESSAGES) {
        logs = logs.slice(-MAX_STORED_MESSAGES);
    }
    
    localStorage.setItem('chatLogs', JSON.stringify(logs));
}

function displayLocalStorageLogs() {
    const logs = JSON.parse(localStorage.getItem('webSocketLogs')) || [];
    logs.forEach(log => {
        console.log(`[${log.timestamp}] ${log.message}`);
    });
}




function closeWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
}

// Call this function when logging out or navigating away from chat
function handleLogout() {
    closeWebSocket();
    localStorage.removeItem('token');
    sessionStorage.clear();
    window.location.href = '#/';
}




// Call this function after your nav is set up
document.addEventListener('DOMContentLoaded', setupDarkModeToggle);

function createChatContent() {
    contentDiv.innerHTML = '';
    setupNav();

    // Chat container setup
    const chatContainer = document.createElement('div');
    chatContainer.id = 'chat-container';

    const chatWithLabel = document.createElement('div');
    chatWithLabel.id = 'chat-with-label';
    chatWithLabel.textContent = 'No active chat'; // Default text when no chat is selected
    chatWithLabel.classList.add('chat-with-label');
    chatContainer.appendChild(chatWithLabel); // Append label to the chat container

    // Container for chat messages
    const messagesContainer = document.createElement('div');
    messagesContainer.id = 'messages-container';
    chatContainer.appendChild(messagesContainer); // Append messages container to the chat container

    // **Add the loading indicator here**
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loading-indicator';
    loadingIndicator.className = 'loading-spinner';
    loadingIndicator.style.display = 'none';
    loadingIndicator.style.position = 'absolute';
    loadingIndicator.style.top = '10px';
    loadingIndicator.style.left = '50%';
    loadingIndicator.style.transform = 'translateX(-50%)';
    messagesContainer.appendChild(loadingIndicator);


    chatContainer.appendChild(messagesContainer); // Append messages container to the chat container
 
     // Notifications container setup
     const notificationsContainer = document.createElement('div');
     notificationsContainer.id = 'notifications-container';
     chatContainer.appendChild(notificationsContainer); // Append it to the chat container or another appropriate place

   // Container for displaying online users
   const onlineUsersContainer = document.createElement('div');
   onlineUsersContainer.id = 'online-users-container';
   const onlineUsersTitle = document.createElement('h3');
   onlineUsersTitle.textContent = "Online Users";
   onlineUsersContainer.appendChild(onlineUsersTitle); // Append title to online users container
   chatContainer.appendChild(onlineUsersContainer); 

    // Input for typing messages
    const messageInput = document.createElement('input');
    messageInput.type = 'text';
    messageInput.id = 'message-input';
    messageInput.placeholder = "Type your message here..."; // Added placeholder text for clarity
    chatContainer.appendChild(messageInput); // Append message input to the chat container


    // Add a placeholder for no messages
    const noMessagesPlaceholder = document.createElement('div');
    noMessagesPlaceholder.id = 'no-messages';
    noMessagesPlaceholder.classList.add('no-messages');
    noMessagesPlaceholder.textContent = 'No messages yet. Start a conversation!';
    messagesContainer.appendChild(noMessagesPlaceholder);


    // Send button for submitting messages
    const sendButton = document.createElement('button');
    sendButton.textContent = 'Send';
    sendButton.id = 'send-button';
    sendButton.addEventListener('click', function(event) {
        event.preventDefault(); // Only needed if the button is inside a form
        sendMessage();
    });
    chatContainer.appendChild(sendButton); // Append send button to the chat container

    messageInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
    });

    // Append the fully configured chatContainer to the main content div
    contentDiv.appendChild(chatContainer);


    chatUIReady = true;
    console.log("Chat UI is ready");


    // Initialize WebSocket connection and other necessary logic
    initializeWebSocket();
    processQueuedMessages();

}
// Function to handle sending messages
function sendMessage() {
    console.log("sendMessage triggered");

    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    const currentChatUser = sessionStorage.getItem('currentChatUser');
    const currentChatUserId = sessionStorage.getItem('currentChatUserId'); // Retrieve the user ID from sessionStorage
    const senderId = localStorage.getItem('userId'); // Get user ID from local storage
    console.log("Current Chat User ID:", currentChatUserId); // Debug log

    if (!message) {
        console.error("Message or receiver ID missing.");
        return;
    }
    const payload = {
        type: currentChatUser ? 'private' : 'broadcast',
        message: message,
        receiverId: currentChatUserId ? parseInt(currentChatUserId) : null, // Use user ID for directing the message
        senderUsername: localStorage.getItem('username'),
        senderId: parseInt(senderId) // Ensure senderId is included and correctly formatted as an integer
    };


    // console.log("Sending message with payload:", JSON.stringify(payload)); // Ensure JSON structure is correct
    displayOutgoingMessage(payload);  // Display the message immediately in the UI


  // Try sending the message and catch any errors
  try {
    ws.send(JSON.stringify(payload));
} catch (error) {
    console.error('Error sending message:', error);
}
    messageInput.value = '';
     // Request to update the online users list after a private message is sent
     requestOnlineUsersList();
    
    function displayOutgoingMessage(message) {
        try {
            const messagesContainer = document.getElementById('messages-container');
            if (!messagesContainer) {
                console.error('Messages container not found');
                return;
            }
            const messageDiv = document.createElement('div');
            messageDiv.className = `message private-message outgoing`;
            
            const contentSpan = document.createElement('span');
            contentSpan.className = 'message-content';
            contentSpan.textContent = `${message.senderUsername}: ${message.message}`;
            messageDiv.appendChild(contentSpan);
    
            const timeSpan = document.createElement('span');
            timeSpan.className = 'message-time';
            timeSpan.textContent = new Date().toLocaleTimeString();
            messageDiv.appendChild(timeSpan);
    
            messagesContainer.appendChild(messageDiv);
            scrollMessagesToBottom();
        } catch (error) {
            console.error('Error displaying outgoing message:', error);
        }
    }
}


let initialLoginComplete = false;

function initializeWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket connection already exists");
        return;
    }

    if (isConnecting) {
        console.log("WebSocket connection is already being established");
        return;
    }

    isConnecting = true;
    const userId = sessionStorage.getItem('userId');
    const token = localStorage.getItem('token');

    if (!userId || !token) {
        console.error("User ID or token not found. Please log in.");
        isConnecting = false;
        return;
    }

    ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    ws.onopen = () => {
        console.log('WebSocket connection established');
        isConnecting = false;
        reconnectAttempts = 0;
        requestOnlineUsersList();

        // Set a flag to indicate this is the initial login
        initialLoginComplete = true;

        // Schedule a delayed request for online users
        setTimeout(() => {
            if (chatUIReady) {
                console.log("Sending delayed request for online users");
                requestOnlineUsersList();
            }
        }, 6000); // Delay of 3 seconds
    };

    ws.onmessage = (event) => {
        console.log("WebSocket message received:", event.data);
        try {
            const message = JSON.parse(event.data);
            if (chatUIReady) {
                displayIncomingMessage(message);
            } else {
                console.log("Chat UI not ready, queueing message:", message);
                queueMessage(message);
            }
        } catch (error) {
            console.error('Error parsing message JSON:', error);
        }
    };

    ws.onclose = (event) => {
        if (event.code === 1001) {
            console.log('WebSocket closed due to page navigation');
        } else {
            console.error('WebSocket closed unexpectedly:', event.code, event.reason);
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    initializeWebSocket();
                }, 5000 * reconnectAttempts); // Exponential backoff
            } else {
                console.error('Max reconnection attempts reached. Please refresh the page.');
            }
        }
        isConnecting = false;
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnecting = false;
    };
}



function queueMessage(message) {
    messageQueue.push(message);
}

function processQueuedMessages() {
    while (messageQueue.length > 0) {
        const message = messageQueue.shift();
        displayIncomingMessage(message);
    }
}

function setupDarkModeToggle() {
    const body = document.body;
    const darkModeToggle = document.createElement('div');
    darkModeToggle.classList.add('mode-toggle');
    darkModeToggle.setAttribute('title', 'Toggle Dark/Light Mode');

    // Insert the toggle button into the navigation bar
    const nav = document.querySelector('nav');
    nav.appendChild(darkModeToggle);

    // Check for saved user preference
    const darkMode = localStorage.getItem('darkMode');

    // Set initial mode
    if (darkMode === 'enabled') {
        body.classList.add('dark-mode');
    }

    // Add click event
    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        
        // Save user preference
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
        } else {
            localStorage.setItem('darkMode', null);
        }
    });
}

// // Call this function after your navigation is set up
// document.addEventListener('DOMContentLoaded', setupDarkModeToggle);

function displayIncomingMessage(message) {
    console.log("Handling incoming message:", message);

    if (!chatUIReady) {
        console.log("Chat UI not ready, queueing message");
        queueMessage(message);
        return;
    }

    try {
        switch (message.type) {
            case 'broadcast':
                // Check if this broadcast message is a duplicate
                const currentTimestamp = Date.now();
                if (currentTimestamp - lastBroadcastTimestamp < 100) { // 100ms threshold
                    console.log("Potential duplicate broadcast message detected, ignoring");
                    return;
                }
                lastBroadcastTimestamp = currentTimestamp;
                displayBroadcastMessage(message);
                break;
            case 'private':
                displayPrivateMessage(message);
                break;
            case 'onlineUsers':
                if (Array.isArray(message.onlineUsers)) {
                    updateOnlineUsersList(message.onlineUsers);
                } else {
                    console.error("Invalid onlineUsers data:", message.onlineUsers);
                }
                break;
            case 'userStatusChange':
                updateUserStatus(message.onlineUsers[0]);
                break;
            default:
                console.warn('Unknown message type:', message.type);
                return;
        }
        if (message.type === 'broadcast' || message.type === 'private') {
            displayNotification(message);
        }
    } catch (error) {
        console.error('Error handling incoming message:', error);
    }
}

function updateUserStatus(user) {
    if (!chatUIReady) {
        console.log("Chat UI not ready, skipping user status update");
        return;
    }

    const onlineUsersContainer = document.getElementById('online-users-container');
    if (!onlineUsersContainer) {
        console.log("Not on chat page, skipping user status update");
        return;
    }

    let userElement = document.querySelector(`.user-div[data-user-id="${user.userId}"]`);
    if (userElement) {
        // Update existing user element
        userElement.textContent = `${user.username} (${user.isOnline ? 'Online' : 'Offline'})`;
        userElement.className = user.isOnline ? 'online-user online' : 'online-user offline';
    } else {
        // If the user isn't in the list, request a full update
        requestOnlineUsersList();
    }
}

function requestOnlineUsersList() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "onlineUsers" }));
    } else {
        console.error("WebSocket is not open. Unable to request online users list.");
    }
}

// Function to initiate private chat and load chat history
function initiatePrivateChat(username, userId) {
    const currentlyChattingWith = sessionStorage.getItem('currentChatUserId');
    if (currentlyChattingWith === userId.toString()) {
        // Clear current chat
        sessionStorage.removeItem('currentChatUserId');
        sessionStorage.removeItem('currentChatUser');
        document.getElementById('messages-container').innerHTML = '';
        document.getElementById('chat-with-label').textContent = 'No active chat';
    } else {
        sessionStorage.setItem('currentChatUser', username);
        sessionStorage.setItem('currentChatUserId', userId);
        document.getElementById('chat-with-label').textContent = `Chat with ${username}`;
        loadAndDisplayChatHistory(userId);
        setupScrollListener(); // Initialize scroll listener
    }
}

// In the setupScrollListener function
function setupScrollListener() {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
        messagesContainer.addEventListener('scroll', function() {
            if (messagesContainer.scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
                loadMoreMessages();
            }
        });
    }
}

// Update the loadMoreMessages function
function loadMoreMessages() {
    if (isLoadingMessages) return; // Prevent multiple simultaneous loads

    isLoadingMessages = true;
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }

    // Ensure the loading indicator is visible for at least 1 second
    setTimeout(() => {
        const currentUserId = sessionStorage.getItem('userId');
        const receiverId = sessionStorage.getItem('currentChatUserId');

        if (!currentUserId || !receiverId) {
            console.error("User IDs are missing.");
            isLoadingMessages = false;
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            return;
        }

        chatHistoryOffset += chatHistoryLimit;
        fetchChatHistory(currentUserId, receiverId, chatHistoryLimit, chatHistoryOffset)
            .then(() => {
                // Keep the loading indicator visible for a short time after loading
                setTimeout(() => {
                    isLoadingMessages = false;
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                }, 500);
            })
            .catch((error) => {
                console.error('Error loading more messages:', error);
                isLoadingMessages = false;
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            });
    }, 1000);
}





function displayBroadcastMessage(message) {
    console.log(`Displaying broadcast message: ${message.senderUsername}: ${message.message}`);
    const messagesContainer = document.getElementById('messages-container');
    const messageElement = document.createElement('div');
    messageElement.className = 'message broadcast-message';
    
    const contentSpan = document.createElement('span');
    contentSpan.className = 'message-content';
    contentSpan.textContent = `${message.senderUsername}: ${message.message}`;
    messageElement.appendChild(contentSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = new Date().toLocaleTimeString();
    messageElement.appendChild(timeSpan);

    messagesContainer.appendChild(messageElement);
    scrollMessagesToBottom();
    removeNoMessagesPlaceholder();
}

// Update the displayPrivateMessage and displayOutgoingMessage functions
function displayPrivateMessage(message) {
    try {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) {
            console.error('Messages container not found');
            return;
        }

        // Update the sessionStorage with the current chat user
        sessionStorage.setItem('currentChatUser', message.senderUsername);
        sessionStorage.setItem('currentChatUserId', message.senderId);

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message private-message';
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = `${message.senderUsername}: ${message.message}`;
        messageDiv.appendChild(contentSpan);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = new Date().toLocaleTimeString();
        messageDiv.appendChild(timeSpan);

        messagesContainer.appendChild(messageDiv);
        scrollMessagesToBottom();
        removeNoMessagesPlaceholder();

        // Update the online users list
        requestOnlineUsersList();
    } catch (error) {
        console.error('Error displaying private message:', error);
    }
}


function removeNoMessagesPlaceholder() {
    const noMessagesPlaceholder = document.getElementById('no-messages');
    if (noMessagesPlaceholder) {
        noMessagesPlaceholder.remove();
    }
}

function scrollMessagesToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
function displayNotification(message) {
    // Find the notifications container
    const notificationsContainer = document.getElementById('notifications-container');
    if (!notificationsContainer) {
        console.error("Notifications container not found.");
        return;
    }

    // Determine the notification text based on message type
    let notificationText;
    if (message.type === 'private') {
        notificationText = `New message from ${message.senderUsername}`;
    } else if (message.type === 'broadcast') {
        notificationText = `Broadcast message from ${message.senderUsername}`;
    } else {
        // Default notification text for other types of messages
        notificationText = "You've received a new notification.";
    }

    // Create a new notification element
    const notificationElement = document.createElement('div');
    notificationElement.classList.add('notification');
    notificationElement.textContent = notificationText;

    // Append the new notification to the notifications container
    notificationsContainer.appendChild(notificationElement);

    // Optionally, remove the notification after a set time
    setTimeout(() => {
        if (notificationsContainer.contains(notificationElement)) {
            notificationsContainer.removeChild(notificationElement);
        }
    }, 10000); // Adjust the duration as needed
}


function updateChatButtonIndicator() {
    const chatBtn = document.getElementById('chatbtn');
    if (newMessageCount > 0) {
        chatBtn.textContent = `myChats (${newMessageCount})`;
    } else {
        chatBtn.textContent = 'myChats';
    }
}



function resetNewMessageCount() {
    newMessageCount = 0;
    updateChatButtonIndicator(); // Assumes this function is also defined in `pages.js`
}

// Modify the updateOnlineUsersList function to log the updates
function updateOnlineUsersList(users) {
    console.log("Updating online users list with data:", users);
    const onlineUsersContainer = document.getElementById('online-users-container');
    if (!onlineUsersContainer) {
        console.error("Online users container not found. Ensure you're on the chat page.");
        return;
    }

    // Clear the container
    onlineUsersContainer.innerHTML = '<h3>Online Users</h3>';

    // Get the current user involved in the private chat from session storage
    const currentChatUserId = sessionStorage.getItem('currentChatUserId');

    // Sort users: 
    // 1. Move the current chat user to the top of the list
    // 2. Sort the remaining users alphabetically by username
    users.sort((a, b) => {
        if (a.userId.toString() === currentChatUserId) return -1;
        if (b.userId.toString() === currentChatUserId) return 1;
        return a.username.localeCompare(b.username);
    });

    // Loop through each user and display them in the list
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = user.isOnline ? 'user-div online' : 'user-div offline';
        userDiv.textContent = `${user.username} (${user.isOnline ? 'Online' : 'Offline'})`;
        userDiv.dataset.userId = user.userId;
        userDiv.addEventListener('dblclick', () => initiatePrivateChat(user.username, user.userId));
        onlineUsersContainer.appendChild(userDiv);
    });
}

function loadAndDisplayChatHistory(userId) {
    const currentUserId = sessionStorage.getItem('userId');
    if (!currentUserId) {
        console.error("Current user ID is missing.");
        return;
    }
    chatHistoryOffset = 0; // Reset offset when starting new chat
    hasMoreMessages = true; // Reset flag
    fetchChatHistory(currentUserId, userId, chatHistoryLimit, chatHistoryOffset);
}

// In the fetchChatHistory function
function fetchChatHistory(senderId, receiverId, limit, offset) {
    const url = `http://localhost:8080/chat-history?senderId=${senderId}&receiverId=${receiverId}&limit=${limit}&offset=${offset}`;
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch chat history');
            }
            return response.json();
        })
        .then(messages => {
            if (messages && messages.length < limit) {
                hasMoreMessages = false; // No more messages to load
                displayNoMoreMessagesIndicator();
            }
            if (messages) {
                displayChatHistory(messages, offset > 0);
            } else {
                console.log('No messages returned from server');
            }
        })
        .catch(error => {
            console.error('Error fetching chat history:', error);
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                messagesContainer.textContent = 'Failed to load chat history.';
            }
            throw error;
        });
}


function displayChatHistory(messages, append = false) {
    const messagesContainer = document.getElementById('messages-container');
    const currentUserId = sessionStorage.getItem('userId');

    if (!append) {
        messagesContainer.innerHTML = '';
    }

    // Reverse messages for chronological order
    messages.reverse();

    let previousHeight = messagesContainer.scrollHeight;

    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        const isOutgoing = message.sender_id.toString() === currentUserId;
        messageDiv.className = `message private-message ${isOutgoing ? 'outgoing' : ''}`;

        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = `${message.senderUsername}: ${message.message_content}`;
        messageDiv.appendChild(contentSpan);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const sentAt = new Date(message.sent_at);
        const formattedDate = !isNaN(sentAt.getTime()) ? sentAt.toLocaleTimeString() : 'Invalid Date';
        timeSpan.textContent = formattedDate;
        messageDiv.appendChild(timeSpan);

        if (append) {
            messagesContainer.insertBefore(messageDiv, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(messageDiv);
        }
    });

    if (append) {
        let newHeight = messagesContainer.scrollHeight;
        messagesContainer.scrollTop = newHeight - previousHeight;
    } else {
        // Scroll to bottom on initial load
        scrollMessagesToBottom();
    }

    // If no messages are present
    if (messages.length === 0 && !append) {
        const noMessages = document.createElement('div');
        noMessages.textContent = 'No previous conversations.';
        noMessages.className = 'no-messages';
        messagesContainer.appendChild(noMessages);
    }
}









function createNewpostContent() {

    // Create an empty post obejct
    const post = {}

    // Create a form for the new post
    const newPostForm = document.createElement("form")
    const newPostTitle = document.createElement("input")
    newPostTitle.setAttribute("id", "newposttitle")
    newPostTitle.setAttribute("placeholder", "Title")
    newPostTitle.required = true

    // Create a text area for the new post content
    const newPostContent = document.createElement("textarea")
    newPostContent.setAttribute("id", "newpostcontent")
    newPostContent.setAttribute("placeholder", "What's on your mind...")
    
    // Create a select dropdown for the new post category
    const category = document.createElement('select');
        category.setAttribute('id', 'newcategory'); 
        category.addEventListener('change' , () => {
            // Update the post obect with the selected category
            post.category_id = parseInt(category.value)
        })
        // Create options for the select dropdown
        const option1 = document.createElement('option');
        option1.value = '1';
        option1.text = 'Sports';
        const option2 = document.createElement('option');
        option2.value = '2';
        option2.text = 'Food';
        const option3 = document.createElement('option');
        option3.value = '3';
        option3.text = 'Politics';
        const option4 = document.createElement('option');
        option4.value = '4';
        option4.text = 'Other';
        
        // Append options to the category select dropdown
        category.appendChild(option1);
        category.appendChild(option2);
        category.appendChild(option3);
        category.appendChild(option4)

        // Create a submit button for the new post form
    const newPostSubmit = document.createElement('input')
    newPostSubmit.setAttribute('type', 'submit')
    newPostSubmit.setAttribute('value', 'Create Post')
    newPostSubmit.setAttribute('id', 'newpostsubmit')


    //Add the title, content, category, and submit button to the new post form
    newPostForm.appendChild(newPostTitle)
    newPostForm.appendChild(newPostContent)
    newPostForm.appendChild(category)
    newPostForm.appendChild(newPostSubmit)

      // Ad the form to the content div
        contentDiv.appendChild(newPostForm)
        
        // Add an event listener for the new post form 
        newPostForm.addEventListener('submit', async (event) => {
            // Prevent the default form submission
            event.preventDefault();
            // Create a new date object
            const now = new Date()

             
            // Get the token from local storage
                const token = localStorage.getItem('token')
                console.log(token)

                // Decode the token to get the user ID
                const decodeToken = jwtDecode(token)
                const userID = decodeToken.userID

                // Update the post object with the user ID
                post.userID = userID
                post.post_title = newPostTitle.value,
                post.post_content = newPostContent.value,
                post.category_id = parseInt(category.value) ,
                post.created_at = now
            console.log(userID)
            console.log(post)
            
            // Send/fetch the new post to the backend
            const response = await fetch('http://localhost:8080/newpost', {
                method : 'POST',
                headers : {
                    'Content-Type' : 'application/json',
                    'Authorization' : `Bearer ${token}`
                },
                body : JSON.stringify(post)
            })
            // If the response is ok, redirect to the forum page
            if (response.ok) {
                const data = await response.json();
                console.log(JSON.stringify(data), "Data")
                window.location.href = '#/forum'
            }else {
                // If the response is not ok, alert the user
                alert('error with new post')
            }
            console.log(newPostTitle.value, newPostContent.value, parseInt(category.value))

        })


    }
    async function viewPostWithComments(postId) {
    contentDiv.innerHTML = ''; // Clear content

    const token = localStorage.getItem('token');
    try {
        // Fetch the post data
        const postResponse = await fetch(`http://localhost:8080/posts/${postId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        if (!postResponse.ok) throw new Error('Failed to fetch post');

        const postData = await postResponse.json();
        await displaySinglePostWithComments(postData);

        // Comments are fetched and displayed within displaySinglePostWithComments
    } catch (error) {
        console.error('Error fetching post:', error);
        alert('Failed to load the post. Please try again later.');
        // Optionally, redirect back to the forum page
        window.location.href = '#/forum';
    }
}

async function displaySinglePostWithComments(postData) {
    contentDiv.innerHTML = ''; // Clear content
    setupNav(); // Set up navigation

    // Fetch all users and create a mapping of user IDs to usernames
    const usersMap = await fetchAllUsers();

    const postElement = document.createElement('div');
    postElement.classList.add('singlepost');

    const titleElement = document.createElement('h2');
    titleElement.textContent = postData.post_title;

    const authorElement = document.createElement('p');
    authorElement.textContent = `By ${postData.username}`; // Using the username from the post data

    const contentElement = document.createElement('p');
    contentElement.textContent = postData.post_content;

    const createdAtElement = document.createElement('p');
    createdAtElement.textContent = `Posted on ${formatDate(postData.created_at)}`;

    const commentsContainer = document.createElement('div');
    commentsContainer.classList.add('comments-section');

    const commentsTitle = document.createElement('h3');
    commentsTitle.textContent = 'Comments';
    commentsContainer.appendChild(commentsTitle);

    try {
        const commentsResponse = await fetch(`http://localhost:8080/comments?postId=${postData.post_id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!commentsResponse.ok) throw new Error('Failed to fetch comments');

        const commentsData = await commentsResponse.json();

        // Display comments in reverse order (most recent first)
        commentsData.reverse().forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.classList.add('comment');

            const commentContent = document.createElement('p');
            commentContent.textContent = comment.content;

            const commentAuthor = document.createElement('p');
            const authorUsername = usersMap[comment.author_id] || 'Unknown User';
            commentAuthor.textContent = `By ${authorUsername}`;

            const commentDate = document.createElement('p');
            commentDate.textContent = `Commented on ${formatDate(comment.created_at)}`;

            commentElement.appendChild(commentContent);
            commentElement.appendChild(commentAuthor);
            commentElement.appendChild(commentDate);

            commentsContainer.appendChild(commentElement);
        });

    } catch (error) {
        console.error('Error fetching comments:', error);
        commentsContainer.appendChild(document.createTextNode('Failed to load comments.'));
    }

    postElement.appendChild(titleElement);
    postElement.appendChild(authorElement);
    postElement.appendChild(contentElement);
    postElement.appendChild(createdAtElement);
    postElement.appendChild(commentsContainer);

    // Add the comment submission form
    const commentForm = document.createElement('form');
    commentForm.setAttribute('id', 'commentForm');
    commentForm.innerHTML = `
        <textarea id="newComment" class="input" placeholder="Add your comment..."></textarea><br>
        <button type="submit" class="submit">Submit</button>
    `;

    commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const newComment = document.getElementById('newComment').value;

        try {
            const response = await fetch('http://localhost:8080/add-comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    post_id: postData.post_id,
                    content: newComment
                })
            });

            if (!response.ok) throw new Error('Failed to add comment');

            alert('Comment added successfully!');
            // Refresh the post and comments section
            displaySinglePostWithComments(postData);

        } catch (error) {
            console.error('Error adding comment:', error);
            alert('Failed to add comment.');
        }
    });

    postElement.appendChild(commentForm);
    contentDiv.appendChild(postElement);
}
    
// Function to fetch all users and create a mapping of user IDs to usernames
async function fetchAllUsers() {
    try {
        const response = await fetch('http://localhost:8080/users', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch users');

        const users = await response.json();
        const usersMap = {};
        users.forEach(user => {
            usersMap[user.user_id] = user.username;
        });
        return usersMap;
    } catch (error) {
        console.error('Error fetching users:', error);
        return {};
    }
}

    export {
        createForumContent, 
        createProfileContent, 
        createChatContent, 
        createNewpostContent,
        resetNewMessageCount,
        displayPrivateMessage,
        displayNotification,
        updateOnlineUsersList,
        initializeWebSocket,
        handleLogout,
        processQueuedMessages,
        initialLoginComplete
    };