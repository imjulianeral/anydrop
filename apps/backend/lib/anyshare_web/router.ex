defmodule AnyshareWeb.Router do
  use AnyshareWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated_api do
    plug :accepts, ["json"]
    plug AnyshareWeb.Plugs.AuthenticateDevice
  end

  get "/up", AnyshareWeb.HealthController, :show
  get "/s/:code", AnyshareWeb.ShortLinkController, :show
  get "/cable", AnyshareWeb.CablePlug, []

  scope "/api/v1", AnyshareWeb.Api.V1 do
    pipe_through :api

    post "/sessions", SessionController, :create
    get "/short_links/:id", ShortLinkController, :show
    get "/local_blobs/*key", LocalBlobController, :show
    put "/local_blobs/*key", LocalBlobController, :update
  end

  scope "/api/v1", AnyshareWeb.Api.V1 do
    pipe_through :authenticated_api

    put "/device", DeviceController, :update
    patch "/device", DeviceController, :update
    get "/peers", PeerController, :index
    get "/short_links", ShortLinkController, :index
    post "/short_links", ShortLinkController, :create
    get "/transfers", TransferController, :index
    post "/transfers", TransferController, :create
    get "/transfers/:id", TransferController, :show
    post "/transfers/:id/complete", TransferController, :complete
  end

  scope "/internal", AnyshareWeb.Internal do
    pipe_through :api
    post "/expire", ExpireController, :create
  end
end
