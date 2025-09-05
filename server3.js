const http = require('http');
const websocket = require('ws');
const readline = require('readline');
const fs = require('fs');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const server = http.createServer(function (req, res) {
  let filepath = "";

  if (req.url === "/" || req.url === "/log") {
    filepath = '/home/puskar-banerjee/WebstormProjects/untitled2/loginpage.html';
  } else if (req.url === "/chat") {
    filepath = '/home/puskar-banerjee/WebstormProjects/untitled2/server2html.html';
  } else if (req.url === "/picture.jpg") {
    filepath = '/home/puskar-banerjee/WebstormProjects/untitled2/picture.jpg';
  }
  else if(req.url === "/letter-p.gif") {
      filepath = '/home/puskar-banerjee/WebstormProjects/untitled2/letter-p.gif';
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.write('404 path not found');
    return res.end();
  }

  fs.readFile(filepath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.write('error loading the page');
      return res.end();
    }

    const contentType = filepath.endsWith(".jpg") ? "image/jpeg" : "text/html";
    res.writeHead(200, { 'content-type': contentType });
    res.write(data);
    return res.end();
  });
});

const wss = new websocket.Server({ server });
const usernames = new Set();
const imgList = new Set();
const chatList = new Set();
const privateChatList = new Map();
const clients = [];
let clientcounter = 1;
const PrivateChatRegister = new Map();
function getPrivateKey(user1,user2){
    return [user1,user2].sort().join("-");
}
function sendAndReceiveMsg() {
  rl.question("send something to the clients: ", (msg) => {
      let message = JSON.stringify({ from: "server",
          text: msg.toString()});
      chatList.add(message);
    for (let c of clients) {
      if (c.type.readyState === websocket.OPEN) {
        c.type.send(message);
      }
    }
    sendAndReceiveMsg();
  });
}

sendAndReceiveMsg();
function sendUserList(ws,exclude){
let userList = [...usernames].filter(item => item !== exclude);
let obj = {
type: "userlist",
content: userList
};
ws.send(JSON.stringify(obj));
}
function sendImgList(ws){
    let obj = {
        type: "imgList",
        data: [...imgList]
    };
    ws.send(JSON.stringify(obj));
}
wss.on("connection", (ws) => {
  let registered = false;
  let client = {
    type: ws,
    id: clientcounter++,
    username: null,
    partnerList: new Set()
  };

  ws.on("message", (message) => {
    const msg = JSON.parse(message.toString());

    // Just checking username availability
    if (!registered && msg.type === "loginCheck") {
      const username = msg.username;
      if (usernames.has(username)) {
        ws.send(JSON.stringify({
          from: "server",
          text: `${username} is not available`,
          check: null
        }));
      } else {
        ws.send(JSON.stringify({
          from: "server",
          text: `Username is available`,
          check: true
        }));
      }
      return;
    }

    // Actual login
    if (!registered && msg.type === "login") {
      const username = msg.username;

      if (usernames.has(username)) {
        ws.send(JSON.stringify({
          from: "server",
          text: `${username} is not available`,
          check: null
        }));
        ws.close();
        return;
      }

      usernames.add(username);
      client.username = username;
      clients.push(client);
      registered = true;
      let message = JSON.stringify({from: "server",
          text: `welcome ${username}`,
          check: true});
      chatList.add(message);
      ws.send(message);
      console.log(`username ${username} joined`);
      sendUserList(ws,username);
      sendImgList(ws);
      let message1 = JSON.stringify({
          from: "server",
          text: `${username} has joined`
      });
      chatList.add(message1);
      for (let c of clients) {
        if (c.type !== ws && c.type.readyState === websocket.OPEN) {
          c.type.send(message1);
        sendUserList(c.type,c.username);
        sendImgList(c.type);
        }
      }
      return;
    }
//Private Chat connection
    if(msg.type==="connReq"){
    const cu = clients.find(client => client.username === msg.CurrentUser);
    const tu = clients.find(client => client.username === msg.TargetUser);
   if(cu&&tu){
    tu.type.send(JSON.stringify({type:"connect",user:cu.username}));
     console.log("Connection Request from:", cu?.username, "to", tu?.username);
   }
}
   if(msg.type==="connResponse"){
   if(msg.status==="disconnected"){
           const username = msg.uname;
           const inactive = clients.find(client => client.username === username);
           const inactivePartner = PrivateChatRegister.get(inactive);
           if(inactivePartner&&inactivePartner.type.readyState === websocket.OPEN){
               inactivePartner.type.send(JSON.stringify({from:"server",mode:"private",text:`${inactive.username.toString()} has quitted private chat`}));
               PrivateChatRegister.delete(inactive);
               PrivateChatRegister.delete(inactivePartner);
               inactivePartner.partnerList.delete(inactive.username);
               inactive.partnerList.delete(inactivePartner.username);
               const inactiveKey = getPrivateKey(inactive.username,inactivePartner.username);
               privateChatList.delete(inactiveKey);
               inactivePartner.type.send(JSON.stringify({type:"partnerList",content:[...inactivePartner.partnerList]}));
               inactive.type.send(JSON.stringify({type:"partnerList",content:[... inactive.partnerList]}));
           }
           return;
       }
    const cu = clients.find(client => client.username === msg.CurrentUser);
    const tu = clients.find(client => client.username === msg.TargetUser);
    if(!cu||!tu) return;
    console.log(cu.username);
    console.log(tu.username);
       cu.partnerList.add(tu.username);
       tu.partnerList.add(cu.username);
       cu.type.send(JSON.stringify({type:"partnerList",content: [...cu.partnerList]}));
       tu.type.send(JSON.stringify({type:"partnerList",content: [...tu.partnerList]}));
       if(msg.type==="buttonEnable"){
           cu.type.send(JSON.stringify({from:"server",type:"buttonEnable"}));
       }
    if(msg.status==="accepted"){
     PrivateChatRegister.set(cu,tu);
     PrivateChatRegister.set(tu,cu);
    cu.type.send(JSON.stringify({from:"server",type:"ConnAccept",text:`${tu.username.toString()} has accepted private chat request`,mode:"private"}));
      console.log("Connection Request from:", cu?.username, "to", tu?.username,"has been accepted");
   }
   else if(msg.status==="rejected"){
   cu.type.send(JSON.stringify({from:"server",type:"ConnFail",text:`${tu.username.toString()} has refused private chat request`}));
      console.log("Connection Request from:", cu?.username, "to", tu?.username,"has been rejected");
}

}

    //Group and Private Chat message
    if (msg.type==="chatmsg"&&registered && client.username) {
    if(!msg.text&&!msg.image) return;
    imgList.add(msg.image);
    if(msg.image&&!msg.text){
        clients.forEach(client => {
            client.type.send(JSON.stringify({
                type: "imgList",
                data: [...imgList]
            }))
        });
    }

//private chat
     //const sender = client;
        if(PrivateChatRegister.has(client)) {
            const partner = PrivateChatRegister.get(client);
            if (partner && partner.type.readyState === websocket.OPEN) {
                const key = getPrivateKey(client.username,partner.username);
                if(!privateChatList.has(key)){
                    privateChatList.set(key,[]);
                }
                privateChatList.get(key).push(JSON.stringify({from: client.username, text: msg.text}));
                partner.type.send(JSON.stringify({from: client.username, text: msg.text,mode:"private"}));
            }
            return;
        }
        let message = JSON.stringify({from: client.username,
            text: msg.text || msg,
            imgResponse: msg.image?? null,
            mode:"group"});
        chatList.add(message);
      for (let c of clients) {
          if(imgList){
              c.type.send(JSON.stringify({
                  type: "imgList",
                  data: [...imgList]
              }));
          }
        if (c.type !== ws && c.type.readyState === websocket.OPEN && !PrivateChatRegister.has(c)) {
          c.type.send(message);
        }
      }
      console.log(`${client.username}: ${msg.text}`);
    }
    if(msg.type==="dateStamp"){
        chatList.add(JSON.stringify({type:"dateRecord",content: msg.content}));
    }
      if(msg.type==="modeShift"){
          ws.send(JSON.stringify({type:"chatBackup",content:[...chatList]}));
      }
  });
  ws.on("close", () => {
    if (client.username) {
      usernames.delete(client.username);
      const index = clients.indexOf(client);
      if (index !== -1) clients.splice(index, 1);
      console.log(`${client.username} has disconnected`);
      let message = JSON.stringify({from: "server",
          text: `${client.username} has disconnected`});
      chatList.add(message);
      for (let c of clients) {
        if (c.type.readyState === websocket.OPEN) {
          c.type.send(message);
          sendUserList(c.type,c.username);
        }
      }
    }
  });
});
server.listen(8080, () => {
  console.log("Server is running on http://localhost:8080");
});
