import express, { query } from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import fs from "fs"
import { error, log } from "console";
import session from "express-session";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import connectPgSimple from "connect-pg-simple";


dotenv.config();
const app = express();
const port = 3000;
const saltRounds = 10;

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  connectionString: process.env.DATABASE_URL,

});
db.connect();
app.use(express.json());
const PgSession = connectPgSimple(session);


app.use(
  session({
    store: new PgSession({
      pool: db, 
      tableName: 'session' 
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, 
      secure: false, 
    },
  })
);


app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/callback"
},
async function(accessToken, refreshToken, profile, done) {
  try {
    const email = profile.emails[0].value;
    const name = profile.displayName;
    const googleId = profile.id;

    
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userResult.rows[0];

    if (!user) {
      
      const insertResult = await db.query(
        'INSERT INTO users (email, name, google_id) VALUES ($1, $2, $3) RETURNING *',
        [email, name, googleId]
      );
      user = insertResult.rows[0];
    }
 user.is_admin = user.email === 'admin@gmail.com'
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = userResult.rows[0];

      if (!user) {
        return done(null, false, { message: 'Incorrect email.' });
      }


      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password.' });
      }

      user.is_admin = user.email === 'admin@gmail.com'
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));


passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/plus.login', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
   
    res.redirect('/');
  }
);




function getCurrentUser(req, res, next) {
  if (req.isAuthenticated()) {
    res.locals.user = req.user;
    res.locals.isAdmin = req.user.is_admin;
  } else {
    res.locals.isAdmin = false;
    res.locals.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  next();
}

app.use(getCurrentUser);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));



var currentDate = new Date().getFullYear()

let movies = [
    {imdbID: 2, moviename: "Avatar 2", plot: "about water"}
]


async function setFavoriteStatusForMovies(movies, userId) {
  if (!userId) return movies;

  const favoritesResult = await db.query(
    "SELECT movie_id FROM favorites WHERE user_id = $1",
    [userId]
  );
  const favoriteMovieIds = favoritesResult.rows.map(row => row.movie_id);

  return movies.map(movie => ({
    ...movie,
    isFavorite: favoriteMovieIds.includes(movie.imdbid)
  }));
}
const edit = false;


app.get("/", async (req, res) => {
  const query = req.query;
  const userId = req.user ? req.user.id : null;

  try {
    const result = await db.query("SELECT * FROM movies");
    let movies = result.rows;

    movies = await setFavoriteStatusForMovies(movies, userId);

    res.render("index.ejs", { movies: movies, query: query, currentDate: new Date(), req: req });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).send("Error fetching movies.");
  }
});

app.get("/new", (req, res)=>  {
    res.render("new.ejs", { edit: false, currentDate: new Date() });
})


app.get('/view/:imdbid', async (req, res) => {
  const imdbid = req.params.imdbid;
  const userId = req.user ? req.user.id : null;

  try {
    console.log(`Fetching movie with imdbid: ${imdbid}`);
    const movieResult = await db.query("SELECT * FROM movies WHERE imdbid = $1", [imdbid]);
    const movie = movieResult.rows[0];

    if (!movie) {
      console.error(`Movie with imdbid ${imdbid} not found`);
      return res.status(404).send("Movie not found");
    }

    console.log(`Fetching comments for movie with imdbid: ${imdbid}`);
    const commentsResult = await db.query(
      `SELECT 
         c.*, 
         u.name 
       FROM 
         comments c 
       JOIN 
         users u 
       ON 
         c.user_id = u.id
       WHERE 
         c.movie_id = $1`,
      [imdbid]
    );
    const comments = commentsResult.rows;

    console.log(`Fetching related movies for movie with imdbid: ${imdbid}`);
    const relatedMoviesResult = await db.query(
      `SELECT * FROM movies WHERE genre = $1 AND imdbid != $2 LIMIT 5`,
      [movie.genre, imdbid]
    );
    const relatedMovies = relatedMoviesResult.rows;

    res.render("view.ejs", { movie: movie, relatedMovies: relatedMovies, comments: comments, currentDate: new Date(), req: req });
  } catch (error) {
    console.error("Error fetching movie:", error);
    res.status(500).send("Error fetching movie.");
  }
});

app.post("/new", async (req, res)=>  {
    var movieName = req.body.movieName;
    var genre = req.body.genre;
    var description = req.body.description;
   
  try {

    const result = await db.query("INSERT INTO movies (moviename, genre, plot) VALUES ($1 ,$2, $3)", [movieName, genre , description])
    
    res.render("new.ejs", {req: req,edit:false, movies:movies, currentDate, message: "You movie has been saved successfully"})
  } catch (error) {
     console.error("Error fetching movies:", error); 
    res.status(500).send("Error fetching movies.");
  }  
})

app.post("/filter/genre/:genre", async (req, res) => {
  const genre = req.body.genre;
  const userId = req.user ? req.user.id : null;

  try {
    const result = await db.query("SELECT * FROM movies WHERE genre = $1", [genre]);
    let filteredMovies = result.rows;

    filteredMovies = await setFavoriteStatusForMovies(filteredMovies, userId);

    res.render("index.ejs", { movies: filteredMovies, query: req.query, currentDate,  req: req });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).send("Error fetching movies.");
  }
});

app.get("/search", async (req, res) => {});


app.post("/search", async (req, res) => {
  const searchQuery = req.body.searchQuery;
  const userId = req.user ? req.user.id : null;

  if (!searchQuery || searchQuery.trim() === "") {
    return res.status(400).send("Search query is required.");
  }

  try {
    const result = await db.query("SELECT * FROM movies WHERE moviename ILIKE $1", [`%${searchQuery}%`]);
    let searchedMovies = result.rows;

    searchedMovies = await setFavoriteStatusForMovies(searchedMovies, userId);

    res.render("index.ejs", { movies: searchedMovies, query: req.query, currentDate: new Date(), req: req });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).send("Error fetching movies.");
  }
});

app.get("/edit-movie/:imdbid", async (req, res) => {
    const imdbid = req.params.imdbid; 
    
    try {
        const result = await db.query("SELECT * FROM movies WHERE imdbid = $1", [imdbid]);
        const movie = result.rows[0]; 

        if (movie) {
            
            res.render("new.ejs", { movie: movie, edit: true, currentDate: new Date() });
        } else {
            res.status(404).send("Movie not found.");
        }
    } catch (error) {
        console.error("Error fetching movie:", error);
        res.status(500).send("Error fetching movie.");
    }
});

  app.post("/edit-movie/:imdbid", async (req, res) => {
    const imdbid = req.params.imdbid; 
    const { movieName, genre, description } = req.body; 
   
    try {
     
      const result = await db.query(
        "UPDATE movies SET moviename = $1, genre = $2, plot = $3 WHERE imdbid = $4",
        [movieName, genre, description, imdbid]
      );
  
      
      res.redirect(`/view/${imdbid}`);
    } catch (error) {
      console.error("Error updating movie:", error);
      res.status(500).send("Error updating movie.");
    }
  });

  app.post('/delete-movie/:imdbid', requireAuth, async (req, res) => {
    const imdbid = req.params.imdbid;
  
    try {
      
      await db.query('DELETE FROM favorites WHERE movie_id = $1', [imdbid]);
  
    
      await db.query('DELETE FROM movies WHERE imdbid = $1', [imdbid]);
  
      res.redirect(req.body.current_route || '/');
    } catch (error) {
      console.error('Error deleting movie:', error);
      res.status(500).send('Error deleting movie.');
    }
  });

app.get("/login", (req, res)=> {
  res.render("login.ejs", {currentDate: new Date().getFullYear() })
})

app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}));

    


app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});



app.get("/signin", (req, res) => {
  res.render("signin.ejs", { currentDate: new Date().getFullYear() });
});

app.post("/signin", async (req, res)=> {
  const name = req.body.name
  const useremail = req.body.email
  const userpassword = req.body.password

  try {
    const emailCheck = await db.query("SELECT * FROM users WHERE email = $1", [useremail]);
    
    if (emailCheck.rows.length > 0){
      res.render("signin.ejs",  {success: false, message: "This email is already registered. Please use another email.", currentDate: new Date().getFullYear() })
    } else {

      bcrypt.hash(userpassword, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          console.log("Hashed Password:", hash);
          await db.query("INSERT INTO users (name, password, email) VALUES ($1, $2, $3)", [name, hash, useremail])
          res.render("signin.ejs",  {success: true, message: "Congrats, you are signed up.", currentDate: new Date().getFullYear() })
        }
      });
     
     
    }
   console.log(emailCheck);
  
  } catch (error) {
    console.error("Error :", error);
    res.status(500).send("Error  .");
    res.render("signin.ejs",  {success: false, message: "There was an error", currentDate: new Date().getFullYear() })
  }

})


app.post('/save-favorite', requireAuth, async (req, res) => {
  try {
    const movieId = req.body.movie_id;
    const userId = req.user.id; 
    const currentPage = req.body.current_page || 1;
    const currentRoute = req.body.current_route || '/';
    const isFavorite = req.body.is_favorite === 'on';
    if (isFavorite) {
      const existingFavorite = await db.query(
        'SELECT * FROM favorites WHERE user_id = $1 AND movie_id = $2',
        [userId, movieId]
      );

      if (existingFavorite.rows.length === 0) {
        await db.query(
          'INSERT INTO favorites (user_id, movie_id) VALUES ($1, $2)',
          [userId, movieId]
        );
      }
    } else {
      await db.query(
        'DELETE FROM favorites WHERE user_id = $1 AND movie_id = $2',
        [userId, movieId]
      );
    }

    res.redirect(currentRoute);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});


app.get("/favorites", requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await db.query(
      "SELECT movies.* FROM movies JOIN favorites ON movies.imdbid = favorites.movie_id WHERE favorites.user_id = $1",
      [userId]
    );
    let favoriteMovies = result.rows;

    favoriteMovies = await setFavoriteStatusForMovies(favoriteMovies, userId);

    res.render("index.ejs", { movies: favoriteMovies, query: req.query, currentDate: new Date(), req: req });
  } catch (error) {
    console.error("Error fetching favorite movies:", error);
    res.status(500).send("Error fetching favorite movies.");
  }
});


app.post("/post-comment",requireAuth, async (req, res)=> {

const comment = req.body.comment;
const movieId = req.body.movie_id;
const userId = req.user.id;

try {
  const result = await db.query("INSERT INTO comments(comment, movie_id, user_id) VALUES ($1, $2, $3)", [comment, movieId, userId])
  res.redirect(`/view/${movieId}`);
} catch (error) {
  console.error('Error posting comment:', error);
    res.status(500).send('Error posting comment.');
}

})

app.get('/comments/:movie_id', async (req, res) => {
  const movieId = req.params.movie_id;

  try {
    const result = await db.query(
      'SELECT comments.*, users.name FROM comments JOIN users ON comments.user_id = users.id WHERE movie_id = $1 ORDER BY created_at DESC',
      [movieId]
    );

    console.log(result.rows);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).send('Error fetching comments.');
  }
});



app.listen(port, ()=> {
console.log(`Listening to port ${port}`);

})
