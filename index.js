const { ApolloServer, gql } = require("apollo-server");
const { cache } = require("./cacheflow.js");

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

  # The "Query" type is special: it lists all of the available queries that
  # clients can execute, along with the return type for each. In this
  # case, the "books" query returns an array of zero or more Books (defined above).
  type Query {
    users: [User]
  }
`;

const users = [
  {
    name: "Walker",
    favoriteFood: "Kate Chopin",
  },
  {
    name: "Tyler",
    favoriteFood: "pizza",
  },
  {
    name: "Ian",
    favoriteFood: "cat food",
  },
  {
    name: "Eddie",
    favoriteFood: "eggs",
  },
];

// Resolvers define the technique for fetching the types defined in the
// schema. This resolver retrieves books from the "books" array above.
const resolvers = {
  Query: {
    users(parent, args, ctx, info) {
      //make sure that info is the param name
      return cache({ resolverName: info.path.key }, () => {
        let x = 0;
        while (x < 10) {
          console.log(x);
          x++;
        }
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
