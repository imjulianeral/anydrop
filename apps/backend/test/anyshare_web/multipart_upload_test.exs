defmodule AnyshareWeb.MultipartUploadTest.R2 do
  import Plug.Conn

  def init(agent), do: agent

  def call(conn, agent) do
    {:ok, body, conn} = read_body(conn)

    request = %{
      method: conn.method,
      query: conn.query_string,
      headers: conn.req_headers,
      body: body
    }

    {status, headers, response} =
      Agent.get_and_update(agent, fn state ->
        [next | remaining] = state.responses
        {next, %{state | responses: remaining, requests: state.requests ++ [request]}}
      end)

    conn =
      Enum.reduce(headers, conn, fn {key, value}, conn -> put_resp_header(conn, key, value) end)

    send_resp(conn, status, response)
  end
end

defmodule AnyshareWeb.MultipartUploadTest do
  use AnyshareWeb.ConnCase, async: false

  alias Anyshare.Accounts
  alias Anyshare.ObjectStore.Multipart
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.Sharing.Transfer
  alias Anyshare.Uploads

  @bytes 64 * 1024 * 1024 + 1
  @part_size 16 * 1024 * 1024
  @etag "bce6bf66aeb76c7040fdd5f4eccb78e6"
  @max_bytes 5 * 1024 * 1024 * 1024 * 1024 - 5 * 1024 * 1024 * 1024

  setup do
    agent = start_supervised!({Agent, fn -> %{responses: [], requests: []} end})

    server =
      start_supervised!({Bandit, plug: {__MODULE__.R2, agent}, port: 0, ip: {127, 0, 0, 1}})

    {:ok, {_ip, port}} = ThousandIsland.listener_info(server)
    original = Application.get_env(:anyshare, :r2)

    Application.put_env(:anyshare, :r2, %{
      access_key_id: "access",
      secret_access_key: "secret",
      bucket: "test-files",
      endpoint: "http://127.0.0.1:#{port}",
      region: "auto"
    })

    on_exit(fn -> Application.put_env(:anyshare, :r2, original) end)

    {:ok, token, sender} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "multipart-test")

    {:ok, transfer, _recipient} =
      Sharing.create_transfer(sender, %{
        "kind" => "file",
        "filename" => "large.bin",
        "byte_size" => @bytes,
        "content_type" => "application/octet-stream"
      })

    %{agent: agent, sender: sender, token: token, transfer: transfer}
  end

  test "selects multipart only above the threshold with R2 configured", %{
    sender: sender,
    transfer: transfer
  } do
    assert transfer.upload_part_size == @part_size
    assert is_nil(Multipart.part_size(64 * 1024 * 1024))
    Application.put_env(:anyshare, :r2, %{})

    {:ok, local, _recipient} =
      Sharing.create_transfer(sender, %{
        "kind" => "file",
        "filename" => "large.bin",
        "byte_size" => @bytes
      })

    assert is_nil(local.upload_part_size)
  end

  test "starts once and signs only valid parts for the stored upload", context do
    %{agent: agent, sender: sender, transfer: transfer} = context

    queue(agent, [
      {200, [],
       "<InitiateMultipartUploadResult><UploadId>upload+/=</UploadId></InitiateMultipartUploadResult>"}
    ])

    assert {:ok, %{part_count: 5, part_size: @part_size}} = Uploads.start(sender, transfer.id)
    assert {:ok, _target} = Uploads.start(sender, transfer.id)
    assert length(requests(agent)) == 1
    assert {:ok, target} = Uploads.part(sender, transfer.id, 5)
    query = target.url |> URI.parse() |> Map.fetch!(:query) |> URI.decode_query()
    assert query["uploadId"] == "upload+/="
    assert query["partNumber"] == "5"
    assert query["X-Amz-SignedHeaders"] == "host"
    assert target.headers == %{}

    for number <- [0, 6, -1, "1", nil],
        do: assert({:error, :invalid_parts} = Uploads.part(sender, transfer.id, number))
  end

  test "accepts files through the R2 object limit and rejects one byte above it", %{
    sender: sender
  } do
    for size <- [2 * 1024 * 1024 * 1024 + 1, 5 * 1024 * 1024 * 1024, @max_bytes] do
      assert {:ok, transfer, _recipient} =
               Sharing.create_transfer(sender, %{
                 "kind" => "file",
                 "filename" => "large.bin",
                 "byte_size" => size
               })

      assert Repo.get!(Transfer, transfer.id).byte_size == size
      assert Multipart.part_count(transfer) <= 10_000
      assert transfer.upload_part_size >= 5 * 1024 * 1024
      assert transfer.upload_part_size <= 5 * 1024 * 1024 * 1024
    end

    assert {:error, changeset} =
             Sharing.create_transfer(sender, %{
               "kind" => "file",
               "filename" => "too-large.bin",
               "byte_size" => @max_bytes + 1
             })

    assert Keyword.has_key?(changeset.errors, :byte_size)
  end

  test "grows parts at the 10,000-part boundary and signs the final part of a maximum-size file",
       %{
         sender: sender
       } do
    assert Multipart.part_size(@part_size * 10_000) == @part_size
    assert Multipart.part_size(@part_size * 10_000 + 1) == 17 * 1024 * 1024
    assert Multipart.part_size(@max_bytes) == 524 * 1024 * 1024

    {:ok, transfer, _recipient} =
      Sharing.create_transfer(sender, %{
        "kind" => "file",
        "filename" => "archive.bin",
        "byte_size" => @max_bytes
      })

    transfer = transfer |> Ecto.Changeset.change(upload_id: "large-upload") |> Repo.update!()
    assert Multipart.part_count(transfer) == 9996
    assert {:ok, target} = Uploads.part(sender, transfer.id, 9996)
    assert target.url =~ "partNumber=9996"
    assert {:error, :invalid_parts} = Uploads.part(sender, transfer.id, 9997)
  end

  test "permits single R2 PUT through its exact byte limit and requires multipart above it" do
    options = [
      content_type: "application/octet-stream",
      byte_size: 5 * 1024 * 1024 * 1024 - 5 * 1024 * 1024
    ]

    assert %{url: url} = Anyshare.ObjectStore.presign_put("transfers/single.bin", options)
    assert url =~ "X-Amz-Signature="

    assert_raise ArgumentError,
                 "R2 uploads above 5 GiB minus 5 MiB require multipart upload",
                 fn ->
                   Anyshare.ObjectStore.presign_put(
                     "transfers/single.bin",
                     Keyword.update!(options, :byte_size, &(&1 + 1))
                   )
                 end
  end

  test "the HTTP flow returns a multipart target and shares only after completion", context do
    %{conn: conn, token: token, agent: agent} = context
    conn = put_req_header(conn, "authorization", "Bearer #{token}")

    created =
      conn
      |> post("/api/v1/transfers", %{
        "kind" => "file",
        "filename" => "large.bin",
        "byte_size" => to_string(@bytes)
      })
      |> json_response(201)

    assert created["upload"] == %{
             "type" => "multipart",
             "part_size" => @part_size,
             "part_count" => 5
           }

    id = created["transfer"]["id"]

    queue(agent, [
      {200, [],
       "<InitiateMultipartUploadResult><UploadId>stored-id</UploadId></InitiateMultipartUploadResult>"}
    ])

    assert conn |> post("/api/v1/transfers/#{id}/multipart") |> json_response(200) ==
             created["upload"]

    signed =
      conn
      |> post("/api/v1/transfers/#{id}/multipart/parts", %{
        "part_number" => 1,
        "upload_id" => "forged-id"
      })
      |> json_response(200)

    assert signed["url"] =~ "uploadId=stored-id"
    queue(agent, [completion(), head()])

    response =
      conn
      |> post("/api/v1/transfers/#{id}/complete", %{"parts" => parts()})
      |> json_response(200)

    assert response["transfer"]["status"] == "uploaded"
    assert response["short_link"]["kind"] == "file"
  end

  test "requires the sender for all multipart endpoints", %{
    conn: conn,
    agent: agent,
    transfer: transfer
  } do
    {:ok, token, _other} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "multipart-other")

    for {method, path, params} <- [
          {:post, "/multipart", %{}},
          {:post, "/multipart/parts", %{"part_number" => 1}},
          {:delete, "/multipart", %{}},
          {:post, "/complete", %{"parts" => parts()}}
        ] do
      response =
        conn
        |> recycle()
        |> put_req_header("authorization", "Bearer #{token}")
        |> dispatch(@endpoint, method, "/api/v1/transfers/#{transfer.id}#{path}", params)

      assert json_response(response, 404) == %{"error" => "not found"}
    end

    assert requests(agent) == []
  end

  test "rejects incomplete, duplicate, unordered and unsafe part lists", context do
    %{agent: agent, sender: sender, transfer: transfer} = started(context)

    for invalid <- [
          nil,
          [],
          Enum.take(parts(), 4),
          Enum.reverse(parts()),
          List.duplicate(hd(parts()), 5),
          List.replace_at(parts(), 0, %{"part_number" => 1, "etag" => "<bad>"})
        ] do
      assert {:error, :invalid_parts} = Sharing.complete_transfer(sender, transfer.id, invalid)
    end

    assert length(requests(agent)) == 1
    assert Repo.get!(Transfer, transfer.id).status == "pending"
  end

  test "completes and verifies the object before sharing, and tolerates a repeated completion",
       context do
    %{agent: agent, sender: sender, transfer: transfer} = started(context)
    queue(agent, [completion(), head()])
    assert {:ok, %{status: "uploaded"}} = Sharing.complete_transfer(sender, transfer.id, parts())
    assert {:ok, %{status: "uploaded"}} = Sharing.complete_transfer(sender, transfer.id, parts())
    assert [_, %{method: "POST", body: body}, %{method: "HEAD"}] = requests(agent)
    assert body =~ "<PartNumber>5</PartNumber>"
  end

  test "does not accept an embedded S3 error in a 200 response", context do
    %{agent: agent, sender: sender, transfer: transfer} = started(context)
    queue(agent, [{200, [], "<Error><Code>InvalidPart</Code></Error>"}, {404, [], ""}])
    assert {:error, _reason} = Sharing.complete_transfer(sender, transfer.id, parts())
    assert Repo.get!(Transfer, transfer.id).status == "pending"
  end

  test "recovers a lost completion response when HEAD matches the uploaded parts", context do
    %{agent: agent, sender: sender, transfer: transfer} = started(context)
    queue(agent, [{404, [], "<Error><Code>NoSuchUpload</Code></Error>"}, head()])
    assert {:ok, %{status: "uploaded"}} = Sharing.complete_transfer(sender, transfer.id, parts())
  end

  test "rejects an assembled object with the wrong byte size", context do
    %{agent: agent, sender: sender, transfer: transfer} = started(context)
    {200, headers, body} = head()

    queue(agent, [
      completion(),
      {200, List.keyreplace(headers, "content-length", 0, {"content-length", "1"}), body}
    ])

    assert {:error, _reason} = Sharing.complete_transfer(sender, transfer.id, parts())
    assert Repo.get!(Transfer, transfer.id).status == "pending"
  end

  test "aborts failed uploads and denies new part URLs", context do
    %{agent: agent, sender: sender, transfer: transfer} = started(context)
    queue(agent, [{204, [], ""}])
    assert {:ok, %{status: "failed", upload_id: nil}} = Uploads.abort(sender, transfer.id)
    assert {:error, :already_completed} = Uploads.part(sender, transfer.id, 1)
    assert List.last(requests(agent)).method == "DELETE"
  end

  test "cannot bypass initiation or use expired uploads", %{sender: sender, transfer: transfer} do
    assert {:error, :not_multipart} = Sharing.complete_transfer(sender, transfer.id)

    transfer
    |> Ecto.Changeset.change(expires_at: NaiveDateTime.add(NaiveDateTime.utc_now(), -1))
    |> Repo.update!()

    assert {:error, :expired} = Uploads.start(sender, transfer.id)
  end

  test "rejects XML declarations that could load external entities", %{
    agent: agent,
    sender: sender,
    transfer: transfer
  } do
    queue(agent, [
      {200, [],
       "<!DOCTYPE x [<!ENTITY id SYSTEM 'file:///etc/passwd'>]><InitiateMultipartUploadResult><UploadId>&id;</UploadId></InitiateMultipartUploadResult>"}
    ])

    assert {:error, :storage_unavailable} = Uploads.start(sender, transfer.id)
    assert is_nil(Repo.get!(Transfer, transfer.id).upload_id)
  end

  defp started(%{agent: agent, sender: sender, transfer: transfer} = context) do
    queue(agent, [
      {200, [],
       "<InitiateMultipartUploadResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><UploadId>upload-id</UploadId></InitiateMultipartUploadResult>"}
    ])

    {:ok, _upload} = Uploads.start(sender, transfer.id)
    context
  end

  defp parts, do: for(number <- 1..5, do: %{"part_number" => number, "etag" => @etag})

  defp completion,
    do:
      {200, [],
       "<CompleteMultipartUploadResult><ETag>#{object_etag()}</ETag></CompleteMultipartUploadResult>"}

  defp head,
    do: {200, [{"content-length", to_string(@bytes)}, {"etag", "\"#{object_etag()}\""}], ""}

  defp object_etag,
    do:
      Base.encode16(:crypto.hash(:md5, :binary.copy(Base.decode16!(@etag, case: :lower), 5)),
        case: :lower
      ) <> "-5"

  defp queue(agent, responses),
    do: Agent.update(agent, &%{&1 | responses: &1.responses ++ responses})

  defp requests(agent), do: Agent.get(agent, & &1.requests)
end
