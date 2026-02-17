# Shade Backend
Shade is a cutting-edge decentralized payment gateway designed to facilitate seamless, secure, and borderless crypto payments for businesses and individuals. Built on the Stellar blockchain, Shade empowers users with fast, cost-effective, and transparent transactions using smart contracts and layer 2 scalability.


## 🚀 Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd shade-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your connection string:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<database>?schema=public"
   ```

4. **Create postgresql database with docker:**
   ```bash
   docker run --name postgres -e POSTGRES_PASSWORD=<password> -d postgres:16-alpine
   ```

### 🗄️ Database Setup

The project uses Prisma for database management.

1. **Initialize the database/Generate Client:**
   ```bash
   npm run prisma:generate
   ```

2. **Run Migrations:**
   Ensure your PostgreSQL server is running, then run:
   ```bash
   npm run prisma:migrate
   ```

3. **Open Prisma Studio (Optional):**
   To visualize and manage your data:
   ```bash
   npm run prisma:studio
   ```

## 🛠️ Development

### Running the application

To start the server in development mode with hot-reloading:
```bash
npm run dev
```

### Building for Production

To compile the TypeScript code to JavaScript:
```bash
npm run build
```

To start the production server:
```bash
npm run start
```

## 📜 Available Scripts

- `npm run dev`: Starts the development server using `tsx`.
- `npm run build`: Compiles the project using `tsc`.
- `npm run prisma:generate`: Generates the Prisma Client.
- `npm run prisma:migrate`: Runs database migrations in development.
- `npm run prisma:studio`: Opens the Prisma GUI.
- `npm run format`: Formats code using Prettier.
- `npm run lint`: Checks for linting errors.

## 🏗️ Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express (v5)
- **Database/ORM**: PostgreSQL + Prisma
- **Blockchain**: Stellar SDK
- **Utilities**: Prettier, ESLint, Helmet, CORS

---

Designed with ❤️ for Shade Protocol.
