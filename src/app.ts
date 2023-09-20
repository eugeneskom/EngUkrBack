import { config } from "./config";
import express from "express";
import cluster from "cluster";
import { logger } from "./utils/logger";
import { cpus } from "os";
import { healthcheck } from "./controllers/controller-healthcheck";
import { getTime, sampleTransaction } from "./controllers/controller-sample";
import pool from "./db";
import bcrypt from "bcrypt";
import cors from "cors";

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
  const corsOptions = {
    origin: 'exp://192.168.0.106:19000', // Replace with your frontend's URL
    methods: 'GET,POST', // Specify allowed HTTP methods
  };
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(router); // tell the app this is the router we are using

  //healthcheck routes
  router.get("/", async (req, res) => {
    try {
      // const results = await pool.query("SELECT * FROM words");
      // console.log("results", results);

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

  router.get("/vocabularyCategories", async (req, res) => {
    try {
      const results = await pool.query("SELECT * FROM vocabulary_categories");
      // console.log("results", results);
      res.json(results.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred while fetching users" });
    }
  });

  router.get('/getWordsByCategory', async (req, res) => {
    try {
      const { category } = req.query;
      const query = 'SELECT * FROM vocabulary WHERE category = $1';
      const values = [category];
      const results = await pool.query(query, values);
      res.json(results.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'An error occurred while fetching words' });
    }
  });

  router.post('/updateUserVocabulary', async (req, res) => {
    try {
      const { userId, wordsToAdd, wordsToRemove } = req.body;
  console.log("updateUserVocabulary: ",userId, wordsToAdd, wordsToRemove)
      // Check if user's table exists
      const tableExistsQuery = `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'user_${userId}_vocabulary'
        );
      `;
  
      const { rows } = await pool.query(tableExistsQuery);
  
      if (!rows[0].exists) {
        // Create user's table
        const createUserTableQuery = `
          CREATE TABLE user_${userId}_vocabulary (
            user_word_id SERIAL PRIMARY KEY,
            word_id INT,
            learned BOOLEAN
          );
        `;
  
        await pool.query(createUserTableQuery);
      }
  
      // Insert words into user's table
      if (wordsToAdd && wordsToAdd.length > 0) {
        const insertWordsQuery = `
          INSERT INTO user_${userId}_vocabulary (word_id, learned)
          VALUES ($1, $2);
        `;
  
        for (const wordId of wordsToAdd) {
          await pool.query(insertWordsQuery, [wordId, false]);
        }
      }
  
      // Remove words from user's table
      if (wordsToRemove && wordsToRemove.length > 0) {
        const removeWordsQuery = `
          DELETE FROM user_${userId}_vocabulary
          WHERE word_id = $1;
        `;
  
        for (const wordId of wordsToRemove) {
          await pool.query(removeWordsQuery, [wordId]);
        }
      }
  
      res.json({ success: true, message: 'User vocabulary updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'An error occurred while updating user vocabulary' });
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
