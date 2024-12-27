import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import fs from "fs"
import { error, log } from "console";
import session from "express-session";

const app = express();
const port = 3000;


const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "movies",
    password: "1212",
    port: 5432,
});
db.connect();
app.use(express.json());
app.use(
  session({
    secret: "pacov123", 
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Use `secure: true` with HTTPS in production
  })
);
function getCurrentUser(req, res, next) {
  if (req.session.user) {
    res.locals.user = req.session.user; 
    res.locals.isAdmin = req.session.user.email === 'aleksa.dj.djuric@gmail.com'; 
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.session.user) {
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
  const userId = req.session.user ? req.session.user.id : null;

  try {
    const result = await db.query("SELECT * FROM movies");
    let movies = result.rows;

    movies = await setFavoriteStatusForMovies(movies, userId);

    res.render("index.ejs", { movies: movies, query: query, currentDate });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).send("Error fetching movies.");
  }
});


app.get("/new", (req, res)=>  {
    res.render("new.ejs", { edit: false, currentDate: new Date() });
})
app.get("/view/:imdbid", async (req, res) => {
    const imdbid = req.params.imdbid; 
    try {
      
      const result = await db.query("SELECT * FROM movies WHERE imdbid = $1", [imdbid]);
      console.log(result.rows);
  
      
      const movies = result.rows[0];
      res.render("view.ejs", { movie:movies, query: req.query, currentDate: new Date() });
  
    } catch (error) {
      console.error("Error fetching movies:", error);
      res.status(500).send("Error fetching movies.");
    }
  });
  

app.post("/new", async (req, res)=>  {
    var movieName = req.body.movieName;
    var genre = req.body.genre;
    var description = req.body.description;
   
  try {

    const result = await db.query("INSERT INTO movies (moviename, genre, plot) VALUES ($1 ,$2, $3)", [movieName, genre , description])
    
    res.render("new.ejs", {edit:false, movies:movies, currentDate, message: "You movie has been saved successfully"})
  } catch (error) {
     console.error("Error fetching movies:", error); 
    res.status(500).send("Error fetching movies.");
  }  
})

app.post("/filter/genre/:genre", async (req, res) => {
  const genre = req.body.genre;
  const userId = req.session.user ? req.session.user.id : null;

  try {
    const result = await db.query("SELECT * FROM movies WHERE genre = $1", [genre]);
    let filteredMovies = result.rows;

    filteredMovies = await setFavoriteStatusForMovies(filteredMovies, userId);

    res.render("index.ejs", { movies: filteredMovies, query: req.query, currentDate });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).send("Error fetching movies.");
  }
});

app.post("/search", async (req, res) => {
  const searchQuery = req.body.searchQuery;
  const userId = req.session.user ? req.session.user.id : null;

  if (!searchQuery || searchQuery.trim() === "") {
    return res.status(400).send("Search query is required.");
  }

  try {
    const result = await db.query("SELECT * FROM movies WHERE moviename ILIKE $1", [`%${searchQuery}%`]);
    let searchedMovies = result.rows;

    searchedMovies = await setFavoriteStatusForMovies(searchedMovies, userId);

    res.render("index.ejs", { movies: searchedMovies, query: req.query, currentDate });
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

  app.get("/delete/:imdbid", async (req, res) => {
    const imdbid = req.params.imdbid; 
    try {
      await db.query("DELETE FROM movies WHERE imdbid = $1", [imdbid]);
      res.redirect("/");
    } catch (err) {
      console.log(err);
    }
  });


app.get("/login", (req, res)=> {
  res.render("login.ejs", {currentDate: new Date().getFullYear() })
})

app.post("/login", async(req, res)=> {
const email = req.body.email;
const password = req.body.password;
let user;
try {
  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  user = result.rows[0]
  console.log(user);

  if (user.email == email && user.password == password) {
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.email === "aleksa.dj.djuric@gmail.com",
    };
    res.redirect("/");
  } else {
    res.render("login.ejs",  {success: false, message: "Email or password is invalid", currentDate: new Date().getFullYear() })
  }

  
    
} catch (error) {
  console.error("Error :", error);
  res.status(500).send("Error  .");
  res.render("login.ejs",  {success: false, message: "There was an error", currentDate: new Date().getFullYear() })
}



 
})

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Error logging out.");
    }
    res.redirect("/login"); 
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
      await db.query("INSERT INTO users (name, password, email) VALUES ($1, $2, $3)", [name, userpassword, useremail])
      res.render("signin.ejs",  {success: true, message: "Congrats, you are signed up.", currentDate: new Date().getFullYear() })
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
    const userId = req.session.user.id;
    const currentPage = req.body.current_page || 1;
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

    res.redirect(`/?page=${currentPage}`);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});


app.listen(port, ()=> {
console.log(`Listening to port ${port}`);

})
