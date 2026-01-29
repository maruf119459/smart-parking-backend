require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let db;

//Database connection function
async function connectDB() {
  try {
    await client.connect();
    db = client.db("SmartParkingSystem"); 
    console.log("MongoDB Atlas Connected");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
  }
}
connectDB();

//Socket.io database update notify function
function notifyUpdate() {
  io.emit("db_update");
}