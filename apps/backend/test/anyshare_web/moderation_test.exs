defmodule AnyshareWeb.ModerationTest.WebRisk do
  import Plug.Conn

  def init(agent), do: agent

  def call(conn, agent) do
    conn = fetch_query_params(conn)

    {status, body} =
      Agent.get_and_update(
        agent,
        &{&1.response, %{&1 | queries: [conn.query_string | &1.queries]}}
      )

    conn |> put_resp_content_type("application/json") |> send_resp(status, body)
  end
end

defmodule AnyshareWeb.ModerationTest do
  use AnyshareWeb.ConnCase, async: false

  alias Anyshare.Accounts
  alias Anyshare.Moderation.Event
  alias Anyshare.Moderation.HashList
  alias Anyshare.Repo
  alias Anyshare.Sharing.ShortLink
  alias Anyshare.Sharing.Transfer
  alias Anyshare.SignalsFixture

  setup %{conn: conn} do
    {:ok, token, _device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "moderation-http")

    %{conn: put_req_header(conn, "authorization", "Bearer #{token}")}
  end

  defp create_file(conn) do
    conn
    |> post("/api/v1/transfers", %{
      "kind" => "file",
      "filename" => "secret.anyshare",
      "content_type" => "application/octet-stream",
      "byte_size" => 32,
      "secret" => %{
        "version" => 3,
        "kdf" => "hkdf-sha256",
        "password" => false,
        "cipher" => "aes-256-gcm",
        "iv" => Base.encode64(:crypto.strong_rand_bytes(12))
      }
    })
    |> json_response(201)
    |> get_in(["transfer", "id"])
  end

  describe "file completion" do
    test "blocks a listed file before it is shared", %{conn: conn} do
      sha256 = :crypto.strong_rand_bytes(32)
      {:ok, 1} = HashList.put_entries([{"sha256", sha256}], "malware", "malware_bazaar")
      id = create_file(conn)

      signals = SignalsFixture.signals(%{"sha256" => Base.encode16(sha256)})

      assert conn
             |> post("/api/v1/transfers/#{id}/complete", %{"signals" => signals})
             |> json_response(451) == %{"error" => "This file can't be shared on AnyShare."}

      assert Repo.get!(Transfer, id).status == "blocked"
      assert Repo.all(ShortLink) == []
      assert [%Event{action: "blocked_upload", transfer_id: ^id}] = Repo.all(Event)
      assert conn |> get("/api/v1/transfers/#{id}") |> json_response(404)

      assert conn
             |> post("/api/v1/transfers/#{id}/complete", %{"signals" => signals})
             |> json_response(409)
    end

    test "requires signals and keeps the upload pending without them", %{conn: conn} do
      id = create_file(conn)

      for body <- [%{}, %{"signals" => %{"md5" => "00"}}] do
        assert conn
               |> post("/api/v1/transfers/#{id}/complete", body)
               |> json_response(422) == %{"error" => "file signals are missing or invalid"}
      end

      assert Repo.get!(Transfer, id).status == "pending"

      assert conn
             |> post("/api/v1/transfers/#{id}/complete", %{
               "signals" => SignalsFixture.signals()
             })
             |> json_response(200)
             |> get_in(["transfer", "status"]) == "uploaded"

      assert Repo.all(Event) == []
    end
  end

  describe "short links" do
    setup do
      agent = start_supervised!({Agent, fn -> %{response: {200, "{}"}, queries: []} end})

      server =
        start_supervised!(
          {Bandit, plug: {__MODULE__.WebRisk, agent}, port: 0, ip: {127, 0, 0, 1}}
        )

      {:ok, {_ip, port}} = ThousandIsland.listener_info(server)
      original = Application.get_env(:anyshare, :web_risk)

      Application.put_env(:anyshare, :web_risk, %{
        api_key: "test-key",
        endpoint: "http://127.0.0.1:#{port}/v1/uris:search"
      })

      on_exit(fn -> Application.put_env(:anyshare, :web_risk, original) end)
      %{agent: agent}
    end

    defp respond(agent, status, body),
      do: Agent.update(agent, &%{&1 | response: {status, body}})

    test "rejects destinations Web Risk flags", %{conn: conn, agent: agent} do
      respond(agent, 200, ~s({"threat":{"threatTypes":["SOCIAL_ENGINEERING"]}}))

      assert conn
             |> post("/api/v1/short_links", %{"url" => "https://phish.example/login"})
             |> json_response(422) == %{"error" => "target_url is flagged as unsafe"}

      assert Repo.all(ShortLink) == []

      assert [%Event{action: "blocked_url", category: "SOCIAL_ENGINEERING"} = event] =
               Repo.all(Event)

      assert event.target_url == "https://phish.example/login"

      [query] = Agent.get(agent, & &1.queries)
      params = URI.query_decoder(query) |> Enum.to_list()
      assert {"uri", "https://phish.example/login"} in params
      assert {"key", "test-key"} in params
      assert {"threatTypes", "MALWARE"} in params
    end

    @tag :capture_log
    test "allows clean destinations and fails open when Web Risk errors", %{
      conn: conn,
      agent: agent
    } do
      assert conn
             |> post("/api/v1/short_links", %{"url" => "https://example.com/a"})
             |> json_response(201)

      respond(agent, 503, "{}")

      assert conn
             |> post("/api/v1/short_links", %{"url" => "https://example.com/b"})
             |> json_response(201)

      assert Repo.all(Event) == []
    end

    test "skips the lookup for invalid URLs", %{conn: conn, agent: agent} do
      assert conn
             |> post("/api/v1/short_links", %{"url" => "javascript:alert(1)"})
             |> json_response(422)

      assert Agent.get(agent, & &1.queries) == []
    end
  end
end
