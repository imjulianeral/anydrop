defmodule PhemeraWeb.Router do
  use PhemeraWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :account_auth do
    plug PhemeraWeb.Plugs.AuthSession
    plug :protect_from_forgery
  end

  scope "/auth", PhemeraWeb do
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

    get "/devices", AccountDeviceController, :index
    post "/devices/current", AccountDeviceController, :save_current
    post "/devices/claims", AccountDeviceController, :create_claim
    delete "/devices/claims/:id", AccountDeviceController, :cancel_claim
    patch "/devices/:id", AccountDeviceController, :update
    delete "/devices/:id", AccountDeviceController, :delete

    get "/dashboard", DashboardController, :show

    get "/team", TeamController, :show
    post "/team", TeamController, :create
    patch "/team", TeamController, :update
    delete "/team", TeamController, :delete
    post "/team/leave", TeamController, :leave
    post "/team/invitations", TeamController, :invite
    delete "/team/invitations/:id", TeamController, :revoke_invitation
    delete "/team/members/:user_id", TeamController, :remove_member
    get "/team/join/:token", TeamController, :preview
    post "/team/join/:token", TeamController, :accept
  end

  pipeline :authenticated_api do
    plug :accepts, ["json"]
    plug PhemeraWeb.Plugs.AuthenticateDevice
  end

  if Application.compile_env(:phemera, :dev_routes) do
    forward "/dev/mailbox", Plug.Swoosh.MailboxPreview
  end

  get "/up", PhemeraWeb.HealthController, :show
  get "/s/:code", PhemeraWeb.ShortLinkController, :show
  get "/api/v1/short_links/:id/download", PhemeraWeb.Api.V1.ShortLinkController, :download
  get "/api/v1/transfers/:id/download", PhemeraWeb.Api.V1.TransferController, :download
  get "/cable", PhemeraWeb.CablePlug, []

  scope "/api/v1", PhemeraWeb.Api.V1 do
    pipe_through :api

    post "/sessions", SessionController, :create
    get "/short_links/:id", ShortLinkController, :show
    post "/short_links/:id/unlock", ShortLinkController, :unlock
    get "/local_blobs/*key", LocalBlobController, :show
    put "/local_blobs/*key", LocalBlobController, :update
  end

  scope "/api/v1", PhemeraWeb.Api.V1 do
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
    get "/device_claims", DeviceClaimController, :index
    patch "/device_claims/:id", DeviceClaimController, :update
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

  scope "/internal", PhemeraWeb.Internal do
    pipe_through :api
    post "/expire", ExpireController, :create
  end
end
