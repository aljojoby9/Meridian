import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const movies = await p.movie.findMany({ select: { title: true, trailerUrl: true, posterUrl: true } });
console.log(JSON.stringify(movies, null, 1));
await p.$disconnect();
