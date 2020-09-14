const admin = require("firebase-admin");
const {
  ApolloServer,
  ApolloError,
  ValidationError,
  gql,
  PubSub,
} = require("apollo-server");

const serviceAccount = require("../service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const pubsub = new PubSub();

const USER_ADDED = "USER_ADDED";

const typeDefs = gql`
  type User {
    id: ID!
    userName: String!
    password: String!
    blogCount: Int!
    blogs: [Blog]
  }

  type Blog {
    id: ID!
    userId: String!
    user: User!
    likes: Int!
    text: String!
  }

  type Query {
    blogs: [Blog]
    user(id: String!): User
  }

  type Mutation {
    CreateUser(email: String!, userName: String!, password: String!): User
    DeleteUser(id: String!): String
    UpdateUser(id: String!, userName: String!, password: String!): User
  }

  type Subscription {
    onCreateUser: User
  }
`;

const resolvers = {
  User: {
    async blogs(user) {
      try {
        const userBlogs = await admin
          .firestore()
          .collection("blogs")
          .where("userId", "==", user.id)
          .get();

        return userBlogs.docs.map((blog) => blog.data());
      } catch (error) {
        throw new ApolloError(error);
      }
    },
  },
  Blog: {
    async user(blog) {
      try {
        const blogAuthor = await admin
          .firestore()
          .doc(`users/${blog.userId}`)
          .get();

        return blogAuthor.data();
      } catch (error) {
        throw new ApolloError(error);
      }
    },
  },
  Query: {
    async blogs() {
      const blogs = await admin.firestore().collection(`blogs`).get();

      return blogs.docs.map((blog) => blog.data());
    },
    async user(_, args) {
      try {
        const userDoc = await admin.firestore().doc(`users/${args.id}`).get();

        const user = userDoc.data();

        return user || new ValidationError("User ID not found");
      } catch (error) {
        throw new ApolloError(error);
      }
    },
  },
  Mutation: {
    async CreateUser(parent, args) {
      const newUser = {
        userName: args.userName,
        email: args.email,
        blogCount: 0,
      };

      try {
        await admin.firestore().collection("users").add(newUser);

        pubsub.publish(USER_ADDED, { newUser });

        return newUser;
      } catch (error) {
        throw new ApolloServer(error);
      }
    },
    async DeleteUser(parent, args) {
      console.log(args.id);

      try {
        await admin.firestore().doc(`users/${args.id}`).delete();

        return "Deleted";
      } catch (error) {
        throw new ApolloServer(error);
      }
    },
    async UpdateUser(parent, args) {
      try {
        await admin.firestore().doc(`users/${args.id}`).update({
          userName: args.userName,
          password: args.password,
        });

        return {
          userName: args.userName,
          password: args.password,
        };
      } catch (error) {
        throw new ApolloServer(error);
      }
    },
  },
  Subscription: {
    onCreateUser: {
      // Additional event labels can be passed to asyncIterator creation
      subscribe: () => pubsub.asyncIterator([USER_ADDED]),
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  //   engine: {
  //     apiKey: "service:mc-test-gql:O5MRVP6LVkSenO3x4Scl4g",
  //     reportSchema: true,
  //     variant: "current",
  //   },

  introspection: true,
  playground: true,
});

const PORT = process.env.PORT || 8080;

server.listen(PORT).then(({ url }) => {
  console.log(`Server is ready at ${url}`);
});
