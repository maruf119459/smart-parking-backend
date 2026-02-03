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



//Slot Management
//add new slot
app.post("/api/slots", async (req, res) => {
  try {
    const { slotNumber, vehicleType, status = "free" } = req.body;

    if (!slotNumber || !vehicleType) {
      return res.status(400).json({ message: "slotNumber and vehicleType are required" });
    }

    const result = await db.collection("slots").insertOne({
      slotNumber,
      vehicleType,
      status
    });

    res.status(201).json({
      message: "Slot added successfully",
      slotId: result.insertedId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/slots", async (req, res) => {
  try {
    const slots = await db
      .collection("slots")
      .find({})
      .sort({ slotNumber: 1 }) // optional: sort A → Z
      .toArray();

    res.status(200).json(slots);
  } catch (err) {
    console.error("Get slots error:", err);
    res.status(500).json({ error: err.message });
  }
});


server.listen(5000, () => console.log("Server running on 5000"));
