
//////****  WEBSOCKET CONNECTION  ****//////

// const socket = new WebSocket("ws://localhost:8080/ws")
// const senderUser = document.getElementById("username")

// socket.onopen = () => {
// console.log("connected successfully")
// }


// socket.onmessage = function (msg) {
// const chatDiv = document.getElementById("chat")
// const data = JSON.parse(msg.data)
// console.log(data)
// console.log(msg.data)
// const senderUsername = senderUser.value
// console.log(senderUsername)

// // if (data.users) {
// //     const usersDiv = document.getElementById("users");
// //    // usersDiv.innerHTML = "<p>Online users:</p>";
// //     for (const user of data.users) {
// //         usersDiv.innerHTML += "<p>" + user + "</p>";
// //     }
// // }

// if (data.username && (data.username !== senderUsername)) {
// chatDiv.innerHTML += "<p><strong>" + data.username + ": </strong>" + data.message + "</p>"

// }else if (data.username === senderUsername){
// data.username = "Me"
// chatDiv.innerHTML += "<p><strong>" + data.username + ": </strong>" + data.message + "</p>"

// }


// console.log(data.message)


// }


//    // Update the user list
// //    socket.onmessage = function (event) {
// //     if (event.data.users) {
// //         const usersDiv = document.getElementById("users");
// //         usersDiv.innerHTML = "<p>Online users:</p>";
// //         for (const user of event.data.users) {
// //             usersDiv.innerHTML += "<p>" + user + "</p>";
// //         }
// //     }
// // };

// socket.onclose = event => {
// console.log("connection closed:", event)
// }

// socket.onerror = err => {
// console.log("error with ws connection:" , err)
// }



// function sendMessage() {
// const usernameInput = document.getElementById("username")
// const messageIpnut = document.getElementById("message")
// const username = usernameInput.value
// const message = messageIpnut.value

// if (username && message) {
// socket.send(JSON.stringify({username, message}))
// messageIpnut.value = ""
// console.log()

// }else {
// console.log('no username or message')
// }

// }

// document.addEventListener("DOMContentLoaded", function() {
// const sendButton = document.getElementById("sendMsg")

// sendButton.addEventListener("click", sendMessage)
// })

