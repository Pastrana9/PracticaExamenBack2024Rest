// main.ts

import { MongoClient, ObjectId } from "mongodb";
import { PersonModel } from "./type.ts";
import { checkFriendsExist, fromModelToPerson } from "./utils.ts";

const MONGO_URL = Deno.env.get("MONGO_URL");

if (!MONGO_URL) {
  console.error("MONGO_URL is not set");
  Deno.exit(1);
}

const client = new MongoClient(MONGO_URL);
await client.connect();
console.info("Connected to MongoDB");

const db = client.db("agenda");
const usersCollection = db.collection<PersonModel>("users");

const handler = async (req: Request): Promise<Response> => {
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    if (method === "GET") {
      if (path === "/personas") {
        const name = url.searchParams.get("nombre");
        const query = name ? { name } : {};
        const usersDB = await usersCollection.find(query).toArray();

        const users = await Promise.all(
          usersDB.map((user) => fromModelToPerson(user, usersCollection)),
        );

        return new Response(JSON.stringify(users), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (path === "/persona") {
        const email = url.searchParams.get("email");
        if (!email) {
          return new Response(
            JSON.stringify({ error: "Email is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const userDB = await usersCollection.findOne({ email });
        if (!userDB) {
          return new Response(
            JSON.stringify({ error: "Persona no encontrada" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const user = await fromModelToPerson(userDB, usersCollection);

        return new Response(JSON.stringify(user), {
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (method === "POST") {
      if (path === "/personas") {
        const data = await req.json();
        const { name, email, phone, friends } = data;

        if (!name || !email || !phone || !friends) {
          return new Response(
            JSON.stringify({
              error: "Name, email, phone and friends are required",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const emailExists = await usersCollection.findOne({ email });
        if (emailExists) {
          return new Response(
            JSON.stringify({ error: "El email ya está registrado." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const phoneExists = await usersCollection.findOne({ phone });
        if (phoneExists) {
          return new Response(
            JSON.stringify({ error: "El teléfono ya está registrado." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const friendsExist = await checkFriendsExist(friends, usersCollection);
        if (!friendsExist) {
          return new Response(
            JSON.stringify({ error: "Amigos no encontrados." }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const friendIds = friends.map((id: string) => new ObjectId(id));

        const insertResult = await usersCollection.insertOne({
          name,
          email,
          phone,
          friends: friendIds,
        });

        const insertedUser = await usersCollection.findOne({ _id: insertResult });
        if (!insertedUser) {
          return new Response(
            JSON.stringify({ error: "Error al crear la persona" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const response = {
          message: "Persona creada exitosamente",
          persona: await fromModelToPerson(insertedUser, usersCollection),
        };

        return new Response(JSON.stringify(response), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (method === "PUT") {
      if (path === "/persona") {
        const data = await req.json();
        const { name, email, phone, friends } = data;

        if (!name || !email || !phone || !friends) {
          return new Response(JSON.stringify({ error: "Faltan datos" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
          return new Response(
            JSON.stringify({ error: "Persona no encontrada" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const phoneExists = await usersCollection.findOne({
          phone,
          email: { $ne: email },
        });
        if (phoneExists) {
          return new Response(
            JSON.stringify({ error: "El teléfono ya está registrado." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const friendsExist = await checkFriendsExist(friends, usersCollection);
        if (!friendsExist) {
          return new Response(
            JSON.stringify({ error: "Amigos no encontrados." }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const friendIds = friends.map((id: string) => new ObjectId(id));

        await usersCollection.updateOne(
          { email },
          { $set: { name, phone, friends: friendIds } },
        );

        const updatedUser = await usersCollection.findOne({ email });
        if (!updatedUser) {
          return new Response(
            JSON.stringify({ error: "Error al actualizar la persona" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const response = {
          message: "Persona actualizada exitosamente",
          persona: await fromModelToPerson(updatedUser, usersCollection),
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (method === "DELETE") {
      if (path === "/persona") {
        const data = await req.json();
        const { email } = data;

        if (!email) {
          return new Response(JSON.stringify({ error: "Email es requerido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
          return new Response(
            JSON.stringify({ error: "Persona no encontrada" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        await usersCollection.deleteOne({ email });

        await usersCollection.updateMany(
          { friends: user._id },
          { $pull: { friends: user._id } },
        );

        const response = { message: "Persona eliminada exitosamente" };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    console.error("Error en handler:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

console.info("Listening on http://localhost:3000/");
Deno.serve({ port: 3000 }, handler);