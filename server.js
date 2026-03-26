require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    "https://city-parking.onrender.com",
    "https://city-parking-admin.onrender.com",
    "http://localhost:3000",
    "http://localhost:8000",
    
    "http://localhost",
    "capacitor://localhost", 
    
    "file://",
    "http://localhost:8080",

    "https://smart-parking-backend-u47b.onrender.com"
];

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000, 
    pingInterval: 25000
});

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS Error: Origin not allowed'));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get("/", (req, res) => {
    res.send("Smart Parking System API is running");
});

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

        console.log("slot id: " + slotId)

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
        status: "request_booking"
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
                status: { $in: ["request_booking", "parked", "paid", "repay"] }
            })
            .sort({ booking_time: -1 })
            .toArray();

        res.json(activeSessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// User Parking History with Date Range
app.get("/api/parking/user-history", async (req, res) => {
    try {
        const { uid, startDate, endDate } = req.query;

        if (!uid) {
            return res.status(400).json({ error: "uid is required" });
        }

        const query = {
            uid: uid,
            status: { $in: ["canceled", "completed"] }
        };

        if (startDate && endDate) {
            query.booking_time = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const history = await db.collection("parking")
            .find(query)
            .sort({ booking_time: -1 })
            .toArray();

        res.json(history);
        console

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//User Ongoing Parking
app.get("/api/parking/ongoing", async (req, res) => {
    try {
        const { uid } = req.query;

        if (!uid) {
            return res.status(400).json({ error: "uid is required" });
        }

        const ongoing = await db.collection("parking")
            .find({
                uid: uid,
                status: { $in: ["request_booking", "parked"] }
            })
            .sort({ booking_time: -1 })
            .toArray();

        res.json(ongoing);
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
    console.log(req.params.entranceId);
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
        const role = "general"

        if (!name || !email || !phone) {
            return res.status(400).json({ error: "name, email, and phone are required" });
        }

        const exists = await db.collection("admininfo").findOne({ email });
        if (exists) {
            return res.status(409).json({ error: "Admin with this email already exists" });
        }
        const result = await db.collection("admininfo").
            insertOne({ name, email, phone, createdAt: new Date() });
        notifyUpdate();

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

        // Delete user from Firebase Auth
        const firebaseUid = adminData.firebaseUid;
        if (firebaseUid) {
            await admin.auth().deleteUser(firebaseUid);
        }


        // Delete from MongoDB
        await db
            .collection("admininfo")
            .deleteOne({ _id: new ObjectId(id) });
        notifyUpdate();

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
        const { vehicleType, chargingRate } = req.body;

        if (!vehicleType || chargingRate === undefined) {
            return res.status(400).json({ message: "vehicleType and chargingRate are required" });
        }

        const result = await db.collection("chargeControls").insertOne({
            vehicleType,
            chargingRate
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
        console.log("app.get(`/api/charge-control`,", vehicleType);
        if (!vehicleType) {
            return res.status(400).json({ message: "vehicleType is required" });
        }
        const result = await db.collection("chargeControls")
            .findOne({ vehicleType }, { projection: { _id: 0, chargingRate: 1 } });

        console.log(result);
        if (!result) {
            return res.status(404).json({ message: "Vehicle type not found" });
        } res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all vehicle types with charge and timeType
app.get("/api/vehicle-types-and-charges", async (req, res) => {
    try {
        const result = await db
            .collection("chargeControls")
            .find({})
            .toArray();

        if (!result || result.length === 0) {
            return res.status(404).json({ message: "No charge data found" });
        }

        res.json(result);
    } catch (err) {
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

//UserManagementFeature
// User Register Details Save 
app.post("/api/users/register", async (req, res) => {
    try {
        const { uid, name, email, phone, agreedToTerms } = req.body;

        if (!uid || !email || !name || !phone) {
            return res.status(400).json({ message: "Invalid user data" });
        }

        if (agreedToTerms !== true) {
            return res.status(400).json({ message: "Terms and conditions must be accepted" });
        }

        const user = {
            uid,                 // Firebase UID
            name,
            email,
            phone,
            agreedToTerms,
            createdAt: new Date()
        };

        const exists = await db.collection("users").findOne({ email });
        if (exists) {
            return res.status(409).json({ error: "This user already exists" });
        }

        await db.collection("users").insertOne(user);

        res.status(201).json({ message: "User profile created" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

//Get Single User Details
app.get("/api/users/:uid", async (req, res) => {
    const { uid } = req.params;

    const user = await db.collection("users").findOne({ uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
});

// Update User Profile
app.patch("/api/users/update-profile", async (req, res) => {
    const { uid, name, phone } = req.body;

    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone) updateFields.phone = phone;

    await db.collection("users").updateOne(
        { uid },
        { $set: updateFields }
    );

    res.json({ message: "Profile updated" });
});

// Get User Parking Statstic
app.get("/api/parking/stats/:uid", async (req, res) => {
    const { uid } = req.params;

    const sessions = await db.collection("parking")
        .find({ uid })
        .toArray();

    const completed = sessions.filter(s => s.status === "completed").length;
    const canceled = sessions.filter(s => s.status === "canceled").length;
    const running = sessions.filter(s =>
        ["request_booking", "parked", "paid", "repay"].includes(s.status)
    ).length;

    res.json({ completed, running, canceled });
});


//PaymentManagementFeature
//Payment Initial API
const SSLCommerzPayment = require("sslcommerz-lts");
app.post("/api/payment/init", async (req, res) => {
    try {
        const { parkingId, amount, name, phone, email, vehicleType } = req.body;

        if (!parkingId || !amount) {
            return res.status(400).json({ error: "parkingId & amount required" });
        }

        const tran_id = "TXN_" + Date.now();

        await db.collection("payments").insertOne({
            parkingId: new ObjectId(parkingId),
            tran_id,
            amount: Number(amount),
            currency: "BDT",
            status: "INIT",
            createdAt: new Date(),
            cus_name: name,
            cus_email: email,
            cus_phone: phone,
            vehicleType: vehicleType
        });

        const data = {
            total_amount: Number(amount),
            currency: "BDT",
            tran_id,

            success_url: "https://smart-parking-backend-u47b.onrender.com/api/payment/success",
            fail_url: "https://smart-parking-backend-u47b.onrender.com/api/payment/fail",
            cancel_url: "https://smart-parking-backend-u47b.onrender.com/api/payment/cancel",
            ipn_url: "https://smart-parking-backend-u47b.onrender.com/api/payment/ipn",

            cus_name: name,
            cus_email: email,
            cus_phone: phone,
            cus_add1: "Dhaka",
            cus_city: "Dhaka",
            cus_state: "Dhaka",
            cus_postcode: "1207",
            cus_country: "Bangladesh",

            shipping_method: "NO",
            ship_name: "N/A",
            ship_add1: "N/A",
            ship_city: "N/A",
            ship_state: "N/A",
            ship_postcode: "0000",
            ship_country: "Bangladesh",

            product_name: "Parking Fee",
            product_category: "Parking",
            product_profile: "general",

            num_of_item: 1,

            value_a: parkingId
        };

        const sslcz = new SSLCommerzPayment(
            process.env.STORE_ID, process.env.API_KEY, false
        );

        const apiResponse = await sslcz.init(data);

        console.log("SSL Response:", apiResponse);

        if (!apiResponse?.GatewayPageURL) {
            return res.status(500).json({
                error: "SSLCommerz init failed",
                details: apiResponse
            });
        }

        res.json(apiResponse);
    } catch (err) {
        console.error("Payment init error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Payment Success API
app.post("/api/payment/success", async (req, res) => {
    try {
        const paymentData = req.body;

        if (!req.body) {
            throw new Error("No body received from SSLCommerz");
        }

        const { tran_id, amount, value_a } = req.body || {};

        if (!tran_id) {
            throw new Error("tran_id missing in response");
        }

        if (paymentData.card_brand === "IB") {
            paymentData.card_brand = "INTERNETBANKING";
        }

        await db.collection("payments").updateOne(
            { tran_id },
            {
                $set: {
                    status: "SUCCESS",
                    paidAt: new Date(),
                    bankName: paymentData.card_issuer,
                    accountType: paymentData.card_brand,
                }
            }
        );

        const exitTime = new Date();
        exitTime.setMinutes(exitTime.getMinutes() + 10);

        await db.collection("parking").updateOne(
            { _id: new ObjectId(value_a) },
            {
                $set: {
                    exitTime: exitTime,
                    status: "paid",
                    paidAmount: Number(amount),
                    paidAt: new Date(),
                }
            }
        );

        notifyUpdate();

        res.redirect("https://city-parking.onrender.com/booking");
    } catch (err) {
        console.error("Payment success error:", err);
        res.redirect("https://city-parking.onrender.com/booking");
    }
});

// Payment Failed API
app.post("/api/payment/fail", async (req, res) => {
    const paymentData = req.body;
    if (paymentData.card_brand === "IB") {
        paymentData.card_brand = "INTERNETBANKING";
    }
    if (req.body?.tran_id) {
        await db.collection("payments").updateOne(
            { tran_id: req.body.tran_id },
            {
                $set: {
                    status: "FAIL",
                    card_issuer: paymentData.card_issuer,
                    card_brand: paymentData.card_brand,
                }
            }
        );
    }
    res.redirect("https://city-parking.onrender.com/booking");
});

// Payment Cancel API
app.post("/api/payment/cancel", async (req, res) => {
    if (req.body?.tran_id) {
        await db.collection("payments").updateOne(
            { tran_id: req.body.tran_id },
            { $set: { status: "CANCEL" } }
        );
    }
    res.redirect("https://city-parking.onrender.com/booking");
});

//AndroidPaymentManagementFeature
//Android Payment Initial API 
const APP_REDIRECT_URL = "com.smart.city.parking://booking";
app.post("/api/apk/payment/init", async (req, res) => {
    try {
        const { parkingId, amount, name, phone, email, vehicleType } = req.body;

        if (!parkingId || !amount) {
            return res.status(400).json({ error: "parkingId & amount required" });
        }

        const tran_id = "TXN_" + Date.now();

        await db.collection("payments").insertOne({
            parkingId: new ObjectId(parkingId),
            tran_id,
            amount: Number(amount),
            currency: "BDT",
            status: "INIT",
            createdAt: new Date(),
            cus_name: name,
            cus_email: email,
            cus_phone: phone,
            vehicleType: vehicleType
        });

        const data = {
            total_amount: Number(amount),
            currency: "BDT",
            tran_id,

            success_url: "https://smart-parking-backend-u47b.onrender.com/api/apk/payment/success",
            fail_url: "https://smart-parking-backend-u47b.onrender.com/api/apk/payment/fail",
            cancel_url: "https://smart-parking-backend-u47b.onrender.com/api/apk/payment/cancel",
            ipn_url: "https://smart-parking-backend-u47b.onrender.com/api/apk/payment/ipn",

            cus_name: name,
            cus_email: email,
            cus_phone: phone,
            cus_add1: "Dhaka",
            cus_city: "Dhaka",
            cus_state: "Dhaka",
            cus_postcode: "1207",
            cus_country: "Bangladesh",

            shipping_method: "NO",
            ship_name: "N/A",
            ship_add1: "N/A",
            ship_city: "N/A",
            ship_state: "N/A",
            ship_postcode: "0000",
            ship_country: "Bangladesh",

            product_name: "Parking Fee",
            product_category: "Parking",
            product_profile: "general",

            num_of_item: 1,

            value_a: parkingId
        };

        const sslcz = new SSLCommerzPayment(
            process.env.STORE_ID, process.env.API_KEY, false
        );

        const apiResponse = await sslcz.init(data);

        console.log("SSL Response:", apiResponse);

        if (!apiResponse?.GatewayPageURL) {
            return res.status(500).json({
                error: "SSLCommerz init failed",
                details: apiResponse
            });
        }

        res.json(apiResponse);
    } catch (err) {
        console.error("Payment init error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Payment Success API
app.post("/api/apk/payment/success", async (req, res) => {
    try {
        const paymentData = req.body;

        if (!req.body) {
            throw new Error("No body received from SSLCommerz");
        }

        const { tran_id, amount, value_a } = req.body || {};

        if (!tran_id) {
            throw new Error("tran_id missing in response");
        }

        if (paymentData.card_brand === "IB") {
            paymentData.card_brand = "INTERNETBANKING";
        }

        await db.collection("payments").updateOne(
            { tran_id },
            {
                $set: {
                    status: "SUCCESS",
                    paidAt: new Date(),
                    bankName: paymentData.card_issuer,
                    accountType: paymentData.card_brand,
                }
            }
        );

        const exitTime = new Date();
        exitTime.setMinutes(exitTime.getMinutes() + 10);

        await db.collection("parking").updateOne(
            { _id: new ObjectId(value_a) },
            {
                $set: {
                    exitTime: exitTime,
                    status: "paid",
                    paidAmount: Number(amount),
                    paidAt: new Date(),
                }
            }
        );

        notifyUpdate();

        res.redirect(APP_REDIRECT_URL);
    } catch (err) {
        console.error("Payment success error:", err);
        res.redirect(APP_REDIRECT_URL);
    }
});

// Payment Failed API
app.post("/api/apk/payment/fail", async (req, res) => {
    const paymentData = req.body;
    if (paymentData.card_brand === "IB") {
        paymentData.card_brand = "INTERNETBANKING";
    }
    if (req.body?.tran_id) {
        await db.collection("payments").updateOne(
            { tran_id: req.body.tran_id },
            {
                $set: {
                    status: "FAIL",
                    card_issuer: paymentData.card_issuer,
                    card_brand: paymentData.card_brand,
                }
            }
        );
    }
    res.redirect(APP_REDIRECT_URL);
});

// Payment Cancel API
app.post("/api/apk/payment/cancel", async (req, res) => {
    if (req.body?.tran_id) {
        await db.collection("payments").updateOne(
            { tran_id: req.body.tran_id },
            { $set: { status: "CANCEL" } }
        );
    }
    res.redirect(APP_REDIRECT_URL);
});


// Get Payments by Parking ID (Only SUCCESS payments)
app.get("/api/payments/:parkingId", async (req, res) => {
    try {
        const { parkingId } = req.params;
        if (!ObjectId.isValid(parkingId)) {
            return res.status(400).json({ error: "Invalid parking ID" });
        }

        const result = await db
            .collection("payments")
            .find({
                parkingId: new ObjectId(parkingId),
                status: "SUCCESS"
            }).sort({ createdAt: 1 })
            .toArray();
        if (!result || result.length === 0) {
            return res.status(404).json({ error: "No successful payments found" });
        }

        res.json(result);

    } catch (err) {
        console.error("Get payment by parkingId error:", err);
        res.status(500).json({ error: "Failed to fetch payments" });
    }
});


//CustomerServiceManagementFeature
// Customer Service API
app.get("/api/customer-service/search", async (req, res) => {
    try {
        const { email, from, to } = req.query;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // ---- Parking date filter (booking_time) ----
        const parkingDateFilter = {};
        if (from || to) {
            parkingDateFilter.booking_time = {};
            if (from) parkingDateFilter.booking_time.$gte = new Date(from + "T00:00:00");
            if (to) parkingDateFilter.booking_time.$lte = new Date(to + "T23:59:59");
        }

        // ---- Payment date filter (createdAt) ----
        const paymentDateFilter = {};
        if (from || to) {
            paymentDateFilter.createdAt = {};
            if (from) paymentDateFilter.createdAt.$gte = new Date(from + "T00:00:00");
            if (to) paymentDateFilter.createdAt.$lte = new Date(to + "T23:59:59");
        }

        // ---- Find parking records ----
        const parkings = await db
            .collection("parking")
            .find({
                email,
                ...parkingDateFilter
            })
            .sort({ booking_time: -1 })
            .toArray();

        if (!parkings.length) {
            return res.json([]);
        }

        // ---- Attach payments ----
        const response = await Promise.all(
            parkings.map(async (parking) => {
                const payments = await db
                    .collection("payments")
                    .find({
                        parkingId: parking._id,
                        ...paymentDateFilter
                    })
                    .sort({ createdAt: 1 })
                    .toArray();

                return {
                    parkingId: parking._id,
                    vehicleType: parking.vehicleType,
                    slotNumber: parking.slotNumber,
                    bookingTime: parking.booking_time,
                    entryTime: parking.entryTime,
                    exitTime: parking.exitTime,
                    paidAmount: parking.paidAmount,
                    parkingStatus: parking.status,
                    customer: {
                        name: parking.name,
                        email: parking.email,
                        phone: parking.phone
                    },
                    payments: payments.map(p => ({
                        transactionId: p.tran_id,
                        amount: p.amount ?? null,
                        currency: p.currency,
                        status: p.status,
                        createdAt: p.createdAt,
                        paidAt: p.paidAt ?? null
                    }))
                };
            })
        );

        res.json(response);

    } catch (err) {
        console.error("Customer service search error:", err);
        res.status(500).json({ error: err.message });
    }
});

//AdminDashboardManagementFeature
const getDateFormat = (from, to) => {
    const diffTime = Math.abs(to - from);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) return "%Y-%m-%d";
    if (diffDays <= 365) return "%Y-%m";
    return "%Y";
};

/**
 * HELPER: Robust Date Parsing
 */
const parseDates = (req) => {
    let { from, to } = req.query;
    const dateFrom = (from && from !== "") ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const dateTo = (to && to !== "") ? new Date(to) : new Date();
    dateTo.setHours(23, 59, 59, 999);

    return {
        dateFrom,
        dateTo,
        format: getDateFormat(dateFrom, dateTo),
        isValid: !isNaN(dateFrom.getTime()) && !isNaN(dateTo.getTime())
    };
};

// 1. User Growth API
app.get("/api/admin/analytics/users", async (req, res) => {
    try {
        const { dateFrom, dateTo, format, isValid } = parseDates(req);
        if (!isValid) return res.status(400).json({ error: "Invalid dates" });

        const data = await db.collection("users").aggregate([
            { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: { $dateToString: { format: format, date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 2. Revenue Timeline API
app.get("/api/admin/analytics/revenue", async (req, res) => {
    try {
        const { dateFrom, dateTo, format, isValid } = parseDates(req);
        if (!isValid) return res.status(400).json({ error: "Invalid dates" });

        const data = await db.collection("payments").aggregate([
            { $match: { status: "SUCCESS", createdAt: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: { $dateToString: { format: format, date: "$createdAt" } }, total: { $sum: "$amount" } } },
            { $sort: { _id: 1 } }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 3. Parking Distribution (Current Status)
app.get("/api/admin/analytics/parking-status", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);
        const data = await db.collection("parking").aggregate([
            { $match: { booking_time: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: "$status", value: { $sum: 1 } } }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 4. Income by Vehicle Type
app.get("/api/admin/analytics/income-by-vehicle", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);
        const data = await db.collection("payments").aggregate([
            { $match: { status: "SUCCESS", createdAt: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: "$vehicleType", value: { $sum: "$amount" } } }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 5. Peak Occupancy Hours
app.get("/api/admin/analytics/peak-hours", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);
        const data = await db.collection("parking").aggregate([
            { $match: { booking_time: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: { $hour: "$booking_time" }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 6. Popular Slots
app.get("/api/admin/analytics/popular-slots", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);
        const data = await db.collection("parking").aggregate([
            { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: "$slotNumber", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 7. Payment Methods
app.get("/api/admin/analytics/payment-methods", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);

        const data = await db.collection("payments").aggregate([
            {
                $match: {
                    status: "SUCCESS",
                    createdAt: { $gte: dateFrom, $lte: dateTo },
                    accountType: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: "$accountType",
                    value: { $sum: 1 }
                }
            },
            {
                $sort: { value: -1 }
            }
        ]).toArray();

        res.json(data);

    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 8. Transaction Status Ratio
app.get("/api/admin/analytics/payment-stats", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);
        const data = await db.collection("payments").aggregate([
            { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 9. Top Customers
app.get("/api/admin/analytics/top-customers", async (req, res) => {
    try {
        const data = await db.collection("payments").aggregate([
            { $match: { status: "SUCCESS" } },
            { $group: { _id: "$cus_email", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
            { $limit: 5 }
        ]).toArray();
        res.json(data);
    } catch (err) { res.status(500).send(err.message); }
});

// 10. Summary Metrics (Avg Duration & Live Occupancy)
app.get("/api/admin/analytics/summary", async (req, res) => {
    try {
        const { dateFrom, dateTo } = parseDates(req);
        const [avgRes, liveCount] = await Promise.all([
            db.collection("parking").aggregate([
                { $match: { exitTime: { $exists: true }, booking_time: { $gte: dateFrom, $lte: dateTo } } },
                { $project: { duration: { $divide: [{ $subtract: ["$exitTime", "$entryTime"] }, 60000] } } },
                { $group: { _id: null, avg: { $avg: "$duration" } } }
            ]).toArray(),
            db.collection("parking").countDocuments({ $or: [{ status: "parked" }, { status: "repay" }] })
        ]);
        res.json({
            avgDuration: avgRes[0]?.avg || 0,
            liveOccupancy: liveCount
        });
    } catch (err) { res.status(500).send(err.message); }
});

//TermsAndConditionsManagementFeature
// Get Terms and Conditions
app.get("/api/terms-and-conditions", async (req, res) => {
    try {
        const terms = await db.collection("termsandconditions").find({}).toArray();
        res.json(terms);
    } catch (err) {
        console.error("Get terms and conditions error:", err);
        res.status(500).json({ error: "Failed to fetch terms and conditions" });
    }
});

// Get Rules and regulations
app.get("/api/rules-and-regulations", async (req, res) => {
    try {
        const rules = await db.collection("rulesandregulations").find({}).toArray();
        res.json(rules);
    } catch (err) {
        console.error("Get rules and regulations error:", err);
        res.status(500).json({ error: "Failed to fetch rules and regulations" });
    }
});

server.listen(5000, () => console.log("Server running on 5000"));
