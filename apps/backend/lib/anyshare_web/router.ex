defmodule AnyshareWeb.Router do
  use AnyshareWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :account_auth do
    plug AnyshareWeb.Plugs.AuthSession
    plug :protect_from_forgery
  end

  scope "/auth", AnyshareWeb do
    pipe_through :account_auth

    get "/session", AuthController, :show
    post "/logout", AuthController, :logout
    patch "/profile", AuthController, :update_profile
    delete "/account", AuthController, :delete_account
    post "/google", AuthController, :google
    get "/google/callback", AuthController, :callback
    delete "/google", AuthController, :unlink_google
    post "/passkeys/signup/options", AuthController, :signup_options
    post "/passkeys/signup", AuthController, :signup
    post "/passkeys/authentication/options", AuthController, :authentication_options
    post "/passkeys/authentication", AuthController, :authenticate
    post "/passkeys/reauthentication/options", AuthController, :reauthentication_options
    post "/passkeys/reauthentication", AuthController, :reauthenticate
    post "/passkeys/registration/options", AuthController, :registration_options
    post "/passkeys/registration", AuthController, :register
    patch "/passkeys/:id", AuthController, :rename_passkey
    delete "/passkeys/:id", AuthController, :delete_passkey
  end

  pipeline :authenticated_api do
    plug :accepts, ["json"]
    plug AnyshareWeb.Plugs.AuthenticateDevice
  end

  get "/up", AnyshareWeb.HealthController, :show
  get "/s/:code", AnyshareWeb.ShortLinkController, :show
  get "/api/v1/short_links/:id/download", AnyshareWeb.Api.V1.ShortLinkController, :download
  get "/api/v1/transfers/:id/download", AnyshareWeb.Api.V1.TransferController, :download
  get "/cable", AnyshareWeb.CablePlug, []

  scope "/api/v1", AnyshareWeb.Api.V1 do
    pipe_through :api

    post "/sessions", SessionController, :create
    get "/short_links/:id", ShortLinkController, :show
    post "/short_links/:id/unlock", ShortLinkController, :unlock
    get "/local_blobs/*key", LocalBlobController, :show
    put "/local_blobs/*key", LocalBlobController, :update
  end

  scope "/api/v1", AnyshareWeb.Api.V1 do
    pipe_through :authenticated_api

    put "/device", DeviceController, :update
    patch "/device", DeviceController, :update
    get "/peers", PeerController, :index
    get "/groups", GroupController, :index
    post "/groups", GroupController, :create
    patch "/groups/:id", GroupController, :update
    delete "/groups/:id", GroupController, :delete
    post "/groups/:id/leave", GroupController, :leave
    get "/groups/:id/transfers", GroupController, :transfers
    get "/invitations", InvitationController, :index
    post "/invitations", InvitationController, :create
    patch "/invitations/:id", InvitationController, :update
    get "/short_links", ShortLinkController, :index
    get "/short_links/:id/stats", ShortLinkController, :stats
    post "/short_links", ShortLinkController, :create
    delete "/short_links/:id", ShortLinkController, :delete
    get "/transfers", TransferController, :index
    post "/transfers", TransferController, :create
    get "/transfers/:id", TransferController, :show
    post "/transfers/:id/complete", TransferController, :complete
    post "/transfers/:id/multipart", UploadController, :create
    post "/transfers/:id/multipart/parts", UploadController, :part
    delete "/transfers/:id/multipart", UploadController, :delete
  end

  scope "/internal", AnyshareWeb.Internal do
    pipe_through :api
    post "/expire", ExpireController, :create
  end
end
