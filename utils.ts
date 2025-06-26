import { Collection, ObjectId } from "mongodb";
import { Person, PersonModel } from "./type.ts";

const fromPersonModelsToFriends = (friends: PersonModel[]) => {
  return friends.map((friend) => ({
    id: friend._id!.toString(),
    name: friend.name,
    email: friend.email,
    phone: friend.phone,
  }));
};

export const fromModelToPerson = async (
  model: PersonModel | null,
  PersonCollection: Collection<PersonModel>,
): Promise<Person> => {
  if (!model) {
    throw new Error("El modelo de persona es null o undefined");
  }

  // Asegurar que friends es array, sino vacio
  const friendIds = Array.isArray(model.friends) ? model.friends : [];

  const friends = await PersonCollection.find({
    _id: { $in: friendIds },
  }).toArray();

  return {
    id: model._id!.toString(),
    name: model.name,
    email: model.email,
    phone: model.phone,
    friends: fromPersonModelsToFriends(friends),
  };
};

export const checkFriendsExist = async (
  friends: string[],
  PersonCollection: Collection<PersonModel>,
) => {
  const friendsDB = await PersonCollection.find({
    _id: { $in: friends.map((id) => new ObjectId(id)) },
  }).toArray();
  return friendsDB.length === friends.length;
};