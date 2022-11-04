const express = require("express");
const cors = require("cors");
const port = process.env.PORT || 5000;
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pdf8psp.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  // console.log("abc");
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    // console.log(decoded); // bar
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const services = client.db("diagnosticCenter");
    const servicesCollection = services.collection("services");
    const bookingCollection = services.collection("booking");
    const usersCollection = services.collection("users");

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    /*api naming convention
     app.get('/booking')
     app.get('/booking')

    */
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    //private make admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //make admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send({ result });
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
      // const authorization = req.headers.authorization;
      // console.log("authorization", authorization);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    //warning
    //this is not the proper way to query.
    //after learning more about mongodb use aggregate lookup, pipeline,match,group
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      //step-1 get all services
      const services = await servicesCollection.find().toArray();

      //step-2 get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      //step-3 for each service ,find bookings for that service
      services.forEach(service => {
        //step-4 find the bookings for that service
        const serviceBookings = bookings.filter(
          book => book.treatment === service.name
        );
        //step-5 select slots for the service bookings: ['','','','']
        const bookedSlots = serviceBookings.map(book => book.slot);
        //step-6 select those slots that are not in bookedSlots
        const available = service.slots.filter(
          slot => !bookedSlots.includes(slot)
        );
        //step-7 set available for slot
        service.slots = available;
      });

      res.send(services);
    });
  } finally {
    // await client.close()
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("connected");
});

app.listen(port, () => {
  console.log(`CORS-enabled web server listening on port ${port}`);
});
