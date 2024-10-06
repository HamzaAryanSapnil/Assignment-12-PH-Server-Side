require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://assignment-12-tourist-guide.web.app",
    "https://assignment-12-tourist-guide.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Timestamp,
} = require("mongodb");
const uri = `mongodb+srv://hamzaaryan:a3mcnn9Hb7x4MART@cluster0.gvtp0gh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("touristGuideDb");
    const userCollection = database.collection("users");
    const packageCollection = database.collection("packages");
    const reviewsCollection = database.collection("reviews");
    const wishListCollection = database.collection("wishList");
    const paymentsCollection = database.collection("payments");

    //   jwt related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middleware
    const verifyJWT = (req, res, next) => {
      const authHeader = req?.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "forbidden access" });
      }
      const token = authHeader.split(" ")[1];
      jwt.verify(token, process?.env?.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyTourGuide = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.role !== "tourGuide") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //   ACCESS_TOKEN_SECRET

    //   user related apis

    //! get all users
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //? get an user

    app.get("/users/:email", async (req, res) => {
      const email = req?.params?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    // check admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req?.params?.email;
      if (email !== req?.decoded?.email) {
        res.status(403).send({
          message: "forbidden access",
          admin: false,
          tourGuide: false,
        });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //? get all tourGuides
    app.get("/allTourGuides", async (req, res) => {
      try {
        const query = { role: "tourGuide" };

        const result = await userCollection.find(query).toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send("Internal Server Error");
      }
    });

    //! get a single tour guide
    app.get("/allTourGuides/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const query = { role: "tourGuide", _id: new ObjectId(id) };

        const result = await userCollection.findOne(query);

        res.send(result);
      } catch (err) {
        res.status(500).send("Internal Server Error");
      }
    });

    //   check tourGuide
    app.get("/users/tourGuide/:email", verifyJWT, async (req, res) => {
      const email = req?.params?.email;
      if (email !== req?.decoded?.email) {
        res.status(403).send({
          message: "forbidden access",
          admin: false,
          tourGuide: false,
        });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let tourGuide = false;
      if (user) {
        tourGuide = user?.role === "tourGuide";
      }
      res.send({ tourGuide });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // let's use put method instead of post method
    app.put("/user", async (req, res) => {
      const user = req.body;

      const query = { email: user?.email };
      const isExist = await userCollection.findOne(query);

      if (isExist) {
        if (user.status === "Requested") {
          // if existing user try to change his role
          const result = await userCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          // if existing user login again
          return res.send(isExist);
        }
      }
      const options = {
        upsert: true,
      };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // i have to check admin and verifyJWT here
    app.patch("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
          status: "verified",
          Timestamp: Date.now(),
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch(
      "/users/tourGuide/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "tourGuide",
            status: "verified",
            Timestamp: Date.now(),
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );
    app.patch(
      "/users/makeUser/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "user",
            status: "verified",
            Timestamp: Date.now(),
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user?.email };

      try {
        const isExistingUser = await userCollection.findOne(filter);

        if (isExistingUser) {
          if (user?.status === "requested") {
            const result = await userCollection.updateOne(filter, {
              $set: { status: user?.status },
            });
            return res.send(result);
          } else {
            return res.send({
              message: "User already exists",
              insertedId: null,
            });
          }
        }

        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...user,
            Timestamp: Date.now(),
          },
        };
        const result = await userCollection.updateOne(
          filter,
          updateDoc,
          options
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // Tour guide assigned tours. while booking i saved tour guide id email in payment collection
    app.get(
      "/tourGuideAssignedTours/:email",
      verifyJWT,
      verifyTourGuide,
      async (req, res) => {
        const email = req.params.email;
        const query = { tourGuideEmail: email };
        const result = await paymentsCollection.find(query).toArray();
        res.send(result);
      }
    );

    // if tour guide rejected the tour then the status will be rejected
    app.patch(
      "/tourGuideAssignedTours/rejected/:id",
      verifyJWT,
      verifyTourGuide,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await paymentsCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // if tour guide approved the tour then the status will be approved
    app.patch(
      "/tourGuideAssignedTours/approved/:id",
      verifyJWT,
      verifyTourGuide,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await paymentsCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    //   our packages related apis
    app.get("/ourPackages", async (req, res) => {
      try {
        const searchQuery = req?.query?.search;
        const tourType = req?.query?.tourType;

        console.log(searchQuery, tourType);

        // Initialize the query object
        let query = {};

        if (searchQuery && searchQuery !== "null") {
          query.title = { $regex: searchQuery, $options: "i" }; // Add title search only if searchQuery is provided
        }

        // If tourType exists and is not 'null', add to query
        if (tourType && tourType !== "null") {
          query.tourType = tourType;
        }

        // If searchQuery exists and is not null, add regex for case-insensitive search by title

        // Fetch the data
        const result = await packageCollection.find(query).toArray();

        // Send the result and immediately return to prevent further execution
        return res.send(result);
      } catch (err) {
        console.error(err);

        // In case of an error, send a 500 response with an error message
        return res.status(500).send("Internal Server Error");
      }
    });

    app.get("/ourPackages/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packageCollection.findOne(query);
      res.send(result);
    });

    app.post("/ourPackages", verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await packageCollection.insertOne(newItem);
      res.send(result);
    });

    app.delete("/ourPackages/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packageCollection.deleteOne(query);
      res.send(result);
    });

    //   wishlist related apis
    app.get("/wishList", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await wishListCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/wishList", async (req, res) => {
      const wishListItem = req.body;
      const result = await wishListCollection.insertOne(wishListItem);
      res.send(result);
    });

    app.delete("/wishList/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishListCollection.deleteOne(query);
      res.send(result);
    });

    // tourist review or story telling section related apis

    // get info from paymentscollection to post in story telling section, those who booked tours will see in story telling section, their they will tell their experience. for this i need that booked tour title, tour guide name and tour guide email, and the information of that user who booked that tour. there is a button in the front end share your experience. If that user click this button then a form will be shown. In that form i will have That tour package's title, tour guide name and tour guide email, and the information of that user who booked that tour and his or her review. Now i will save that review in review collection. After that i will get all reviews from review collection with all data, and i will show it in the homepage Story telling section.
    // 1. create an api for single completed tour details
    // 2. now post that tour details in story reviewsCollection collection
    // 3. get that tour details from story reviewsCollection collection

    app.get("/tour_story", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.get("/tour_story/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);

      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.findOne(query);
      res.send(result);
    });

    app.post("/tour_story", async (req, res) => {
      const tour_story = req.body;
      const result = await reviewsCollection.insertOne(tour_story);
      res.send(result);
    });

    //   payment related apis

    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req?.query?.email;
      if (email !== req?.decoded?.email) {
        res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      res.send(result);
    });

    // i need to delete payement after booking
    app.delete("/payments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await paymentsCollection.deleteOne(query);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log("amount inside the intent: ", amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
