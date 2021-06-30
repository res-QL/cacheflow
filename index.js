const { ApolloServer, gql } = require('apollo-server');
const { cache, initCache } = require('./cacheflow.js');

initCache({
  local: {
    checkExpire: 30,
  },
  redis: {
    host: '127.0.0.1',
    port: '6379',
  },
});

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  # This "Book" type defines the queryable fields for every book in our data source.
  type User {
    name: String
    favoriteFood: String
  }

  type Food {
    name: String
  }

  # The "Query" type is special: it lists all of the available queries that
  # clients can execute, along with the return type for each. In this
  # case, the "books" query returns an array of zero or more Books (defined above).
  type Query {
    users: [User]
    food: [Food]
  }
`;

const users = [
  {
    name: 'Walker',
    favoriteFood: 'Kate Chopin',
  },
  {
    name: 'Tyler',
    favoriteFood: 'pizza',
  },
  {
    name: 'Ian',
    favoriteFood: 'cat food',
  },
  {
    name: 'Eddie',
    favoriteFood: 'eggs',
  },
];

const food = [
  {
    name: 'Apple',
  },
  {
    name: 'Pizza',
  },
  {
    name: 'Orange',
  },
  {
    name: 'Pasta',
  },
];

// Resolvers define the technique for fetching the types defined in the
// schema. This resolver retrieves books from the "books" array above.
const resolvers = {
  Query: {
    users(parent, args, ctx, info) {
      //make sure that info is the param name
      return cache({ location: 'local', maxAge: 10 }, info, () => {
        let x = 0;
        while (x < 1000) {
          console.log(x++);
        }

        return users;
      });
    },
    food(parent, args, ctx, info) {
      return cache({ location: 'redis', maxAge: 10 }, info, () => {
        let x = 0;
        while (x < 1000) {
          console.log(x++);
        }

        return food;
      });
    },
  },
};

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
const server = new ApolloServer({ typeDefs, resolvers });

// The `listen` method launches a web server.
server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
