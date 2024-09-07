import { createForumContent, createProfileContent, createNewpostContent, createChatContent } from "./pages.js";
import { resetNewMessageCount, handleLogout, processQueuedMessages, initialLoginComplete} from './pages.js';
import {jwtDecode} from './node_modules/jwt-decode/build/esm/index.js'
import { initializeWebSocket } from './pages.js';
// Get references to the content div and the navigation links
const contentDiv = document.getElementById('content');
const postContainer = document.createElement('div')
const forumnavbar = document.createElement('nav')
 

// View templates
const postobj = { 
    Title : '',
    Author : '',
    Content : '',
}

function navToWindow(url) {
    window.location.href = url
}

export function setupNav() {
   
    forumnavbar.innerHTML = ''


 // Create profile button
    const profilebtn = document.createElement('button');
    profilebtn.setAttribute('class', 'button'); // Apply class for styling
    profilebtn.setAttribute('id', 'profilebtn');
    profilebtn.textContent = 'myProfile';
    profilebtn.addEventListener('click', function(event) {
        event.preventDefault();
        navToWindow('#/myProfile');
    });
    
    const chatbtn = document.createElement('button')
    chatbtn.setAttribute('class', 'button'); // Apply class for styling
    chatbtn.setAttribute('id', 'chatbtn');
    chatbtn.textContent = 'myChats';
    chatbtn.addEventListener('click', function(event) {
        event.preventDefault();
        navToWindow('#/myChats');
    });
 
    const newpostbtn = document.createElement('button')
    newpostbtn.setAttribute('class', 'button'); // Apply class for styling)
    newpostbtn.setAttribute('id', 'newpostbtn');
    newpostbtn.textContent = 'Create New Post';
    newpostbtn.addEventListener('click', function(event) {
        event.preventDefault();
        navToWindow('#/newpost');
    });

    const homebtn = document.createElement('button')
    homebtn.setAttribute('class', 'button');
    homebtn.setAttribute('id', 'homebtn');
    homebtn.textContent = 'Back To Forum'
    homebtn.addEventListener('click', function(event) {
        event.preventDefault();
        navToWindow('#/forum');
    });
    
    const logoutbtn = document.createElement('button');
    logoutbtn.setAttribute('class','button');
    logoutbtn.setAttribute('id','logoutbtn');
    logoutbtn.textContent = 'Logout';
    logoutbtn.addEventListener('click',  handleLogout);
   
 
    forumnavbar.appendChild(profilebtn)
    forumnavbar.appendChild(chatbtn)
    forumnavbar.appendChild(newpostbtn)
    forumnavbar.appendChild(homebtn)
    forumnavbar.appendChild(logoutbtn)
    
    contentDiv.appendChild(forumnavbar)

}

function appendNavAndContent(navbar, container) {
    contentDiv.appendChild(navbar)
    contentDiv.appendChild(container)
}
// Function to update the view based on the current hash
function renderPage(page) {

        contentDiv.innerHTML = ''

   // const currentHash = window.location.hash;
    switch (page) {
        case '#/':
           loginP()
        break;
           case '#/forum' :
            forumP()
            break;
            case '#/myProfile' :
                profileP()
                break;
                case '#/myChats' :
                    chatsP()
                    break;
                    case '#/newpost' :
                        newpostP()
                        break;
                        case '#/register' :
                            registerP()
                            break;
        default:
            contentDiv.textContent   = '<h1>Page not found</h1>';
            break;
    }
}


function loginP() {
    const token = localStorage.getItem('token');
    if (token) {
        // initializeWebSocket();
        window.location.href = '#/forum';
        return;
    }

    const loginPage = document.createElement('div');
    loginPage.setAttribute('class', 'loginpge');

    const title = document.createElement('h1');
    title.textContent = 'LOGIN';

    const loginForm = document.createElement('form');
    loginForm.setAttribute('method', 'post');
    loginForm.setAttribute('action', '#');
    loginForm.setAttribute('class', 'loginForm');

    const usernameInput = document.createElement("input");
    usernameInput.setAttribute('type', 'text');
    usernameInput.setAttribute('id', 'usernameinput');
    usernameInput.setAttribute('placeholder', 'Please enter your email or username...');

    const passwordInput = document.createElement("input");
    passwordInput.setAttribute('type', 'password');
    passwordInput.setAttribute('id', 'passwordinput');
    passwordInput.setAttribute('placeholder', 'Please enter your password...');

    const submitbtn = document.createElement('input');
    submitbtn.setAttribute('type', 'submit');
    submitbtn.setAttribute('value', 'login');
    submitbtn.setAttribute('id', 'submitbtn');

    const registerLink = document.createElement('a');
    registerLink.setAttribute('href', '#/register');
    registerLink.textContent = "register ";

    loginForm.appendChild(usernameInput);
    loginForm.appendChild(document.createElement('br'));
    loginForm.appendChild(document.createElement('br'));
    loginForm.appendChild(passwordInput);
    loginForm.appendChild(document.createElement('br'));
    loginForm.appendChild(document.createElement('br'));
    loginForm.appendChild(submitbtn);
    loginForm.appendChild(document.createElement('br'));
    loginForm.appendChild(document.createElement('br'));
    loginForm.appendChild(registerLink);

    loginPage.appendChild(title);
    loginPage.appendChild(loginForm);

    contentDiv.appendChild(loginPage);

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = usernameInput.value;
        const password = passwordInput.value;

        // Make a POST request to your /login endpoint
        const response = await fetch('http://localhost:8080/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        if (response.ok) {
            const data = await response.json();
            console.log('Data Received', data);
            localStorage.setItem('token', data.token); // Store token
            localStorage.setItem('username', data.username); // Store username
            localStorage.setItem('userId', data.userId);
            sessionStorage.setItem('userId', data.userId); // Store userId in sessionStorage


            // // Initialize WebSocket connection after successful login
            // initializeWebSocket();

            // Redirect to the forum page regardless of JWT decoding success
            window.location.href = '#/forum';
        } else {
            console.error('Login request failed');
            const errorData = await response.json();
            alert(`Login failed: ${errorData.message}`);
        }
    });
}
// document.addEventListener('DOMContentLoaded', loginP);

function registerP() {
    const registerPage = document.createElement('div');
    registerPage.setAttribute('class', 'registerpage');

    const title = document.createElement('h1');
    title.textContent = 'REGISTER';

    const registerForm = document.createElement('form');
    registerForm.setAttribute('method', 'post');
    registerForm.setAttribute('action', '#/');
    registerForm.setAttribute('class', 'registerform');

    const username = document.createElement('input')
    username.setAttribute('type', 'text');
    username.setAttribute('id', 'newusername');
    username.setAttribute('placeholder', 'Please create a username');

    const age = document.createElement('input')
    age.setAttribute('type', 'text');
    age.setAttribute('id', 'newage');
    age.setAttribute('placeholder', 'Please enter your age');

    
    const gender = document.createElement('select');
    gender.setAttribute('id', 'newgender'); 
    const option1 = document.createElement('option');
    option1.value = 'male';
    option1.text = 'Male';
    const option2 = document.createElement('option');
    option2.value = 'female';
    option2.text = 'Female';
    const option3 = document.createElement('option');
    option3.value = 'other';
    option3.text = 'Other';
    gender.appendChild(option1);
    gender.appendChild(option2);
    gender.appendChild(option3);

    const firstname = document.createElement('input')
    firstname.setAttribute('type', 'text');
    firstname.setAttribute('id', 'newfirstname');
    firstname.setAttribute('placeholder', 'Please enter your first name')

    const lastname = document.createElement('input')
    lastname.setAttribute('type', 'text');
    lastname.setAttribute('id', 'newlastname');
    lastname.setAttribute('placeholder', 'Please enter your last name')

    const email = document.createElement('input')
    email.setAttribute('type', 'text');
    email.setAttribute('id', 'newemail');
    email.setAttribute('placeholder', 'Please enter your email')

    const password = document.createElement('input')
    password.setAttribute('type', 'text');
    password.setAttribute('id', 'newpassword');
    password.setAttribute('placeholder', 'Please create a password')

    const submitbtn = document.createElement('input');
    submitbtn.setAttribute('type', 'submit');
    submitbtn.setAttribute('value', 'register');
    submitbtn.setAttribute('id', 'submitbtn');


    registerForm.appendChild(username)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(age)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(gender)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(firstname)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(lastname)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(email)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(password)
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(document.createElement('br'));
    registerForm.appendChild(submitbtn)

    registerPage.appendChild(title)
    registerPage.appendChild(registerForm)
    contentDiv.appendChild(registerPage)

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const user = {
            username: username.value,
            age: parseInt(age.value), // Convert age to an integer if needed
            gender: gender.value,
            first_name: firstname.value,
            last_name: lastname.value,
            email: email.value,
            password: password.value
        };


        const response = await fetch('http://localhost:8080/register' ,{
            method : 'POST',
            headers : {
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify(user)
        })

        if (response.ok) {
            const data = await response.json();
            console.log(JSON.stringify(data))
            window.location.href = '#/';

        } else {
            alert('error!!')
        }
    })



}
 
async function profileP() {

    contentDiv.innerHTML = '';
    setupNav()
    appendNavAndContent(forumnavbar, postContainer)
    createProfileContent()

    
    
}




async function chatsP() {
    contentDiv.innerHTML = '';
    setupNav();
    
    resetNewMessageCount();

    if (localStorage.getItem('token')) {
        createChatContent(); // Set up the chat UI
        await new Promise(resolve => setTimeout(resolve, 100)); // Short delay to ensure DOM is updated
        // chatUIReady = true; // Mark the chat UI as ready
        processQueuedMessages(); // Process any messages that were received before UI was ready

        // If this is not the initial login, request the online users list again
        if (initialLoginComplete) {
            setTimeout(() => {
                requestOnlineUsersList();
            }, 2000); // Delay of 1 second
        }
    } else {
        alert("Please log in to view chats.");
        window.location.href = '#/';
    }
}



function forumP() {


    contentDiv.innerHTML = '';

   setupNav()
   appendNavAndContent(forumnavbar, postContainer)



   createForumContent()
   



}

// Add a single, comprehensive hashchange event listener
window.addEventListener('hashchange', () => {
    updateView(); // This function should handle routing based on the current hash

    // Handle WebSocket closure when navigating away from chat
    if (window.location.hash !== '#/myChats') {
        if (typeof closeWebSocket === 'function') {
            closeWebSocket();
        }
        if (typeof chatUIReady !== 'undefined') {
            chatUIReady = false;
        }
    }
});

//Consider using a client-side router library (like React Router or Vue Router) for a more structured and scalable navigation system to 
//naviaget between sections of the app

// Define the updateView function if it doesn't already exist
function updateView() {
    const currentHash = window.location.hash;
    renderPage(currentHash || '#/');
}



// Ensure this function is called when the page loads
document.addEventListener('DOMContentLoaded', () => {
    updateView();
});