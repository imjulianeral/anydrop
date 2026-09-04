import * as Alchemy from "alchemy";

export const ExpireSecret = Alchemy.Random("ExpireSecret");

export const BackendSecretKeyBase = Alchemy.Random("BackendSecretKeyBase");
