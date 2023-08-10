import { config } from "./config";
import express from "express";
import cluster from "cluster";
import { logger } from "./utils/logger";
import { cpus } from "os";
//import controllers
import { healthcheck } from "./controllers/controller-healthcheck";
import { getTime, sampleTransaction } from "./controllers/controller-sample";
import pool from "./db";

import bcrypt from "bcrypt";
import cors from "cors";
// const cors = require("cors"); // If you haven't installed it yet, run `npm install cors`

// const bcrypt = require('bcrypt');
const numCPUs = cpus().length;

if (cluster.isPrimary) {
  // create a worker for each CPU
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on("online", (worker) => {
    logger.info(`worker online, worker id: ${worker.id}`);
  });
  //if worker dies, create another one
  cluster.on("exit", (worker, code, signal) => {
    logger.error(`worker died, worker id: ${worker.id} | signal: ${signal} | code: ${code}`);
    cluster.fork();
  });
} else {
  //create express app
  const app: express.Express = express();
  const router: express.Router = express.Router();

  app.use(cors());
  app.use(express.json());
  app.use(router); // tell the app this is the router we are using

  //healthcheck routes
  router.get("/", async (req, res) => {
    try {
      const results = await pool.query("SELECT * FROM words");
      console.log("results", results);
      // res.json(results.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred while fetching users" });
    }
  });

  router.post("/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;
  
      // Check if the user already exists based on username or email
      const checkQuery = 'SELECT * FROM users WHERE username = $1 OR email = $2';
      const existingUser = await pool.query(checkQuery, [username, email]);
  
      if (existingUser.rows.length > 0) {
        // User already exists
        return res.status(400).json({ message: 'User already exists' });
      }
  
      // Hash and salt the password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Insert user data into the database
      const insertQuery = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)';
      await pool.query(insertQuery, [username, email, hashedPassword]);
  
      res.status(201).json({ message: 'Registration successful' });
    } catch (error) {
      console.error('Error during registration:', error);
      res.status(500).json({ message: 'Registration failed' });
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Check if the user exists based on the email
      const userQuery = 'SELECT * FROM users WHERE email = $1';
      const user = await pool.query(userQuery, [email]);
  
      if (user.rows.length === 0) {
        // User not found
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      // Compare the provided password with the hashed password in the database
      const passwordMatch = await bcrypt.compare(password, user.rows[0].password);
  
      if (!passwordMatch) {
        // Passwords do not match
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      // Successful login
      res.status(200).json({ message: 'Login successful' });
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });
  
  
  

  router.get("/exercise_sentences", async (req, res) => {
    try {
      const results = await pool.query("SELECT * FROM exercise_sentences");
      // console.log("results", results);
      res.json(results.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred while fetching users" });
    }
  });

  router.get("/healthcheck", healthcheck);
  // sampleController routes
  router.get("/servertime", getTime);
  router.get("/transaction", sampleTransaction);
  router.post("/add-word", async (req, res) => {
    try {
      const { eng, ukr } = req.body;
      const newWord = await pool.query("INSERT INTO words (eng, ukr) VALUES($1, $2) RETURNING *", [eng, ukr]);
      res.json(newWord.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred while adding word" });
    }
  });

  app.listen(config.port, function () {
    const workerId = cluster.worker && cluster.worker.id ? cluster.worker.id : undefined;
    logger.info(`worker started: ${workerId} | server listening on port: ${config.port}`);
  });
}
