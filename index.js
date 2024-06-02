import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import cron from 'node-cron';



const secretKey = crypto.randomBytes(32).toString('hex');

console.log(secretKey);

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "task",
  password: "7177",
  port: 5432,
});

const app = express();
const port = 3000;

db.connect()
  .then(() => console.log("connected"))
  .catch(err => console.error('connection error', err.stack));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const router = express.Router();
const PgSession = connectPgSimple(session);


app.use(session({
    store: new PgSession({
      pool: db,
      tableName: 'sessions',
   
    }),
    secret: secretKey,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  }));


router.post('/sign', (req, res) => {
  const { name, email, password } = req.body;


  const checkUserQuery = `
    SELECT * FROM user_data WHERE email = $1;
  `;
  

  db.query(checkUserQuery, [email])
    .then(result => {
      if (result.rows.length > 0) {
        res.status(400).send('User already exists');
      } else {
        
        const insertUserQuery = `
          INSERT INTO user_data (name, email, password) VALUES ($1, $2, $3);
        `;
        db.query(insertUserQuery, [name, email, password])
          .then(() => res.redirect('/login.html'))
          .catch(error => {
            console.error('Error creating user:', error);
            res.status(500).send('Error creating user');
          });
      }
    })
    .catch(error => {
      console.error('Error checking user:', error);
      res.status(500).send('Error checking user');
    });
});


router.post('/login', (req, res) => {
  const { email, password } = req.body;
  console.log(`Login attempt with email: ${email} and password: ${password}`);

  
  const checkCredentialsQuery = `
    SELECT * FROM user_data WHERE email = $1 AND password = $2;
  `;
  
  db.query(checkCredentialsQuery, [email, password])
    .then(result => {
      if (result.rows.length > 0) {
      
        
        req.session.userid = result.rows[0].id; 
        res.redirect('/home.html');
      } else {
        res.status(401).send('Invalid email or password');
      }
    })
    .catch(error => {
      console.error('Error checking credentials:', error);
      res.status(500).send('Error checking credentials');
    });
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
      user: 'madhurajangle2004@gmail.com',
      pass: 'baun icas crbn xbeh'  
  }
});
let tasks = []; 


app.get('/tasks', async (req, res) => {
  if (!req.session.userid) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const result = await db.query(
      `SELECT * FROM task WHERE userid = $1`,
      [req.session.userid]
    );
    tasks = result.rows; 
    res.json(tasks); 
  } catch (err) {
    console.error('Error fetching tasks', err);
    res.status(500).send('Error fetching tasks');
  }
});


app.post('/add-task', async (req, res) => {
   
    const { title, description, deadline, time, status, email } = req.body;
    tasks.push({ title, description, deadline, time, status,email });
    console.log(deadline);
  console.log(time);
  console.log(email);
  const taskTime = new Date(`${deadline}T${time}`);

    // Get the time one hour before the task time
    const oneHourBeforeTask = new Date(taskTime.getTime() - 60 * 60 * 1000);
    const hours = oneHourBeforeTask.getHours();
    const minutes = oneHourBeforeTask.getMinutes();

    console.log(`Task Time: ${taskTime}`);
    console.log(`One Hour Before Task: ${oneHourBeforeTask}`);

    const cronExpression = `0 ${minutes} ${hours} * * *`;
    console.log(`Cron Expression: ${cronExpression}`);
    // Schedule email sending one hour before the task time using node-cron
    cron.schedule(`0 ${minutes} ${hours} * * *`, () => {
      console.log('Cron job triggered');
        const mailOptions = {
            from: '"Madhura" <madhurajangle2004@gmail.com>',
            to: email,
            subject: `Reminder: ${title}`,
            text: `You have a task "${title}" due in one hour. Description: ${description}`
        };

        transporter.sendMail(mailOptions)
            .then(info => {
                console.log('Email sent:', info.response);
            })
            .catch(error => {
                console.error('Error sending email:', error);
            });
    });

    
    try {
        await db.query(
            `INSERT INTO task (title, description, deadline, time, status, userid) VALUES ($1, $2, $3, $4, $5, $6)`,
            [title, description, deadline, time, status, req.session.userid]
        );
        res.redirect('/home.html');
    } catch (err) {
        console.error('Error executing query', err);
        res.status(500).send('Error adding task to database');
    }
});


app.use('/', router);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

router.get('/task/title', async (req, res) => {
  const { title } = req.query;
  try {
      const result = await db.query(
          `SELECT * FROM task WHERE title = $1 `,
          [title]
      );
      if (result.rows.length > 0) {
          res.json(result.rows[0]);
      } else {
          res.status(404).send('Task not found');
      }
  } catch (err) {
      console.error('Error executing query', err);
      res.status(500).send('Error fetching task details');
  }
});

app.post('/task/update', (req, res) => {
  const { title, description, deadline, time, status } = req.body;
  tasks.push({ title, description, deadline, time, status });
  
  const updateTaskQuery = `
      UPDATE task
      SET description = $1, deadline = $2, time = $3, status = $4 
      WHERE title = $5 
      RETURNING *;
  `;
  
  db.query(updateTaskQuery, [description, deadline, time, status, title])
      .then(result => {
          if (result.rows.length > 0) {
              res.redirect('/home.html');
          } else {
              res.status(404).send('Task not found');
          }
      })
      .catch(error => {
          console.error('Error updating task:', error);
          res.status(500).send('Server error');
      });
});


