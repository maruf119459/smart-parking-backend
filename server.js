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


//get all slots api
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

//update slot status api
app.patch("/api/slots-status-update/:slotId", async (req, res) => {
  try {
    const { slotId } = req.params;
    const { status } = req.body;

    console.log("slot id: "+slotId)

    // 1️⃣ Validate ObjectId
    if (!ObjectId.isValid(slotId)) {
      return res.status(400).json({ message: "Invalid slotId" });
    }

    // 2️⃣ Validate status
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // (optional) restrict allowed values
    const allowedStatus = ["free", "booked"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${allowedStatus.join(", ")}`
      });
    }

    // 3️⃣ Update
    const result = await db.collection("slots").updateOne(
      { _id: new ObjectId(slotId) },
      { $set: { status } }
    );

    // 4️⃣ Ensure document exists
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Slot not found" });
    }

    notifyUpdate();

    return res.status(200).json({
      message: "Slot status updated successfully",
      modified: result.modifiedCount
    });

  } catch (err) {
    console.error("Slot status update error:", err);
    return res.status(500).json({ error: err.message });
  }
});

//update slot slotNumber and vehicleType api
app.patch("/api/slots-update-slotNumber-vehicleType/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { slotNumber, vehicleType } = req.body;

        // Build update object dynamically
        const updates = {};

        if (slotNumber !== undefined) {
            updates.slotNumber = slotNumber;
        }

        if (vehicleType !== undefined) {
            updates.vehicleType = vehicleType;
        }

        // Nothing valid to update
        if (Object.keys(updates).length === 0) {
            return res
                .status(400)
                .json({ message: "Only slotNumber or vehicleType can be updated" });
        }

        const result = await db.collection("slots").updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Slot not found" });
        }

        res.json({
            message: "Slot updated successfully",
            updatedFields: updates
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//delete slot api
app.delete("/api/slots/:id", async (req, res) => {
    try {
        const result = await db.collection("slots").deleteOne({
            _id: new ObjectId(req.params.id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Slot not found" });
        }

        res.json({ message: "Slot deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//get available slots count by vehicle type api
app.get("/api/slots/available", async (req, res) => {
    try {
        const result = await db
            .collection("slots")
            .aggregate([
                { $match: { status: "free" } },
                {
                    $group: {
                        _id: "$vehicleType",
                        available: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        vehicleType: "$_id",
                        available: 1
                    }
                }
            ])
            .toArray();

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Parking Management
// Parking Booking Api
app.post("/api/parking/book", async (req, res) => {
    const data = {
        uid: req.body.uid,   
        vehicleType: req.body.vehicleType,
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        slotNumber: null,
        booking_time: new Date(),
        entryTime: null,
        exitTime: null,
        paidAmount: null,
        status: "inital"
    };

    await db.collection("parking").insertOne(data);
    notifyUpdate();
    res.sendStatus(201);
});

// User Current Parking
app.get("/api/parking/user-current-parking", async (req, res) => {
    try {
        const { uid } = req.query;

        if (!uid) {
            return res.status(400).json({ error: "uid is required" });
        }

        const activeSessions = await db.collection("parking")
            .find({
                uid: uid,
                status: { $in: ["inital", "parked", "paid", "repay"] }
            })
            .sort({ booking_time: -1 })
            .toArray();

        res.json(activeSessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Parkin History
app.get("/api/parking/user-history", async (req, res) => {
    try {
        const { uid } = req.query;

        if (!uid) {
            return res.status(400).json({ error: "uid is required" });
        }

        const history = await db.collection("parking")
            .find({
                uid: uid,
                status: { $in: ["entance_error", "completed"] }
            })
            .sort({ booking_time: -1 }) 
            .toArray();

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Parking API
app.get("/api/parking", async (req, res) => {
  try {
    const parkingData = await db
      .collection("parking")
      .find({})
      .sort({ entryTime: -1 }) // optional: latest first
      .toArray();

    res.status(200).json(parkingData);
  } catch (err) {
    console.error("Get parking error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update parking info
app.patch("/api/parking/:entranceId", async (req, res) => {
    console.log(req.params.entranceId );
  await db.collection("parking").updateOne(
    { _id: new ObjectId(req.params.entranceId) },
    { $set: req.body }
  );
  notifyUpdate();
  res.sendStatus(200);
});

// Get Only Parking Entry Exit Time
app.get("/api/parking/times", async (req, res) => {
    try {
        const { parkingId, userId } = req.query;

        const query = {};
        if (parkingId) query._id = new ObjectId(parkingId);
        if (userId) query.userId = userId;

        const result = await db
            .collection("parking")
            .find(query, {
                projection: {
                    entryTime: 1,
                    exitTime: 1,
                    _id: 1
                }
            })
            .toArray();

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// QR Code
const QRCode = require("qrcode");

// Entrance QR Code Genaration
app.post("/api/qr/entrance", async (req, res) => {
    const qrData = JSON.stringify(req.body);
    const qr = await QRCode.toDataURL(qrData);
    res.json({ qr });
});

// Exit QR Code Genaration 
app.post("/api/qr/exit", async (req, res) => {
    const qrData = JSON.stringify({ entranceId: req.body.entranceId });
    const qr = await QRCode.toDataURL(qrData);
    res.json({ qr });
});

// QR Code Decode API
const jsQR = require("jsqr");
const { createCanvas, loadImage } = require("canvas");
app.post("/api/qr/decode", async (req, res) => {
    const img = await loadImage(req.body.image);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const code = jsQR(imageData.data, img.width, img.height);

    res.json(code ? JSON.parse(code.data) : null);
});

// AdminManagementFeature
// Add New Admin API
app.post("/api/admin", async (req, res) => {
    try {
        const { name, email, phone } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({ error: "name, email, and phone are required" });
        }

        const exists = await db.collection("admininfo").findOne({ email });
        if (exists) {
            return res.status(409).json({ error: "Admin with this email already exists" });
        }
        const result = await db.collection("admininfo").
            insertOne({ name, email, phone, createdAt: new Date() });
        res.status(201).json({ message: "Admin added successfully", adminId: result.insertedId });
    } catch (err) {
        console.error("Add admin error:", err);
        res.status(500).json({ error: "Failed to add admin" });
    }
});

// Get All Amdmin
app.get("/api/admin", async (req, res) => {
    try {
        const admins = await db.collection("admininfo").
            find({}).sort({ createdAt: -1 }).toArray();
        res.json(admins);
    } catch (err) {
        console.error("Get admins error:", err);
        res.status(500).json({ error: "Failed to fetch admins" });
    }
});

// Get Single Admin Details
app.get("/api/admin/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid admin ID" });
        }

        const admin = await db
            .collection("admininfo")
            .findOne({ _id: new ObjectId(id) });

        if (!admin) {
            return res.status(404).json({ error: "Admin not found" });
        }

        res.json(admin);
    } catch (err) {
        console.error("Get admin by ID error:", err);
        res.status(500).json({ error: "Failed to fetch admin" });
    }
});


// Search admin by email
app.get("/api/admin/search/:email", async (req, res) => {
    try {
        const { email } = req.params;
        if (!email || email.trim() === "") {
            return res.status(400).json({ error: "Email is required" });
        }
        const admin = await db.collection("admininfo").
            findOne({ email: email.trim() });
        return res.status(200).json({ exists: !!admin });
    } catch (err) {
        console.error("Search admin error:", err);
        return res.status(500).json({ error: "Failed to search admin" });
    }
});

// Update User Admin UID
app.patch("/api/admin/update-by-email", async (req, res) => {
  try {
    const { email, firebaseUid } = req.body;

    if (!email || !firebaseUid) {
      return res.status(400).json({
        message: "Email and firebaseUid are required"
      });
    }

    const result = await db.collection("admininfo").updateOne(
      { email: email.trim().toLowerCase() },
      {
        $set: {
          firebaseUid,
          isRegistered: true,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({
      message: "Admin info updated successfully"
    });

  } catch (err) {
    console.error("Admin update error:", err);
    res.status(500).json({ error: "Failed to update admin info" });
  }
});

const admin = require("firebase-admin");

// Firebase Admin Init
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), 
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
  })
});

// Delete Admin by id
app.delete("/api/admin/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid admin ID" });
    }

    // Find admin first (to get firebase UID)
    const adminData = await db
      .collection("admininfo")
      .findOne({ _id: new ObjectId(id) });

    if (!adminData) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const firebaseUid = adminData.firebaseUid;
    if (!firebaseUid) {
      return res.status(400).json({ error: "Firebase UID missing" });
    }

    // Delete user from Firebase Auth
    await admin.auth().deleteUser(firebaseUid);

    // Delete from MongoDB
    await db
      .collection("admininfo")
      .deleteOne({ _id: new ObjectId(id) });

    res.json({
      message: "Admin deleted from MongoDB and Firebase successfully",
    });

  } catch (err) {
    console.error("Delete admin error:", err);
    res.status(500).json({ error: "Failed to delete admin" });
  }
});

//ChargeManagementFeature
//Add New Vehicle and It's Charge
app.post("/api/charge-control", async (req, res) => {
    try {
        const { vehicleType, chargePerMinutes } = req.body;

        if (!vehicleType || chargePerMinutes === undefined) {
            return res.status(400).json({ message: "vehicleType and chargePerMinutes are required" });
        }

        const result = await db.collection("chargeControls").insertOne({
            vehicleType,
            chargePerMinutes
        });

        res.status(201).json({
            message: "Charge control added",
            id: result.insertedId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Vehicle Charge
app.get("/api/charge-control", async (req, res) => {
    try {
        const { vehicleType } = req.query;
        console.log(vehicleType)
        if (!vehicleType) {
            return res.status(400).json({ message: "vehicleType is required" });
        }
        const result = await db.collection("chargeControls")
            .findOne({ vehicleType }, { projection: { _id: 0, chargePerMinutes: 1 } });

        console.log(result);
        if (!result) {
            return res.status(404).json({ message: "Vehicle type not found" });
        } res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Charge or Vehicle
app.patch("/api/charge-control/:id", async (req, res) => {
    try {
        const updates = req.body;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No fields provided for update" });
        }

        const result = await db.collection("chargeControls").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Charge control not found" });
        }

        res.json({ message: "Charge control updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Vehicle and It's Charge
app.delete("/api/charge-control/:id", async (req, res) => {
    try {
        const result = await db.collection("chargeControls").deleteOne({
            _id: new ObjectId(req.params.id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Charge control not found" });
        }

        res.json({ message: "Charge control deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Vehicle Types
app.get("/api/vehicle-types", async (req, res) => {
    try {
        const vehicleTypes = await db
            .collection("chargeControls")
            .distinct("vehicleType");

        res.json(vehicleTypes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
server.listen(5000, () => console.log("Server running on 5000"));
