defmodule Phemera.ModerationTest do
  use Phemera.DataCase, async: true

  alias Phemera.Accounts
  alias Phemera.Moderation
  alias Phemera.Moderation.Event
  alias Phemera.Moderation.HashList
  alias Phemera.Moderation.MalwareBazaar
  alias Phemera.Moderation.Signals
  alias Phemera.Sharing
  alias Phemera.SignalsFixture

  defp signals(overrides \\ %{}) do
    {:ok, signals} = overrides |> SignalsFixture.signals() |> Signals.parse()
    signals
  end

  defp flip_bits(hash, count), do: :crypto.exor(hash, <<Integer.pow(2, count) - 1::256>>)
  defp hex(bytes), do: Base.encode16(bytes, case: :lower)

  defp pending_file do
    {:ok, _token, sender} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "moderation-test")

    {:ok, transfer, _recipient} =
      Sharing.create_transfer(sender, %{
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

    transfer
  end

  describe "Signals.parse/1" do
    test "accepts hex digests and drops low-quality PDQ hashes" do
      pdq = :crypto.strong_rand_bytes(32)

      assert {:ok, %Signals{pdq: [^pdq]}} =
               Signals.parse(
                 SignalsFixture.signals(%{
                   "pdq" => [
                     %{"hash" => hex(pdq), "quality" => 90},
                     %{"hash" => hex(:crypto.strong_rand_bytes(32)), "quality" => 10}
                   ]
                 })
               )
    end

    test "rejects missing or malformed signals" do
      for params <- [
            nil,
            %{},
            %{"md5" => "abc", "sha256" => String.duplicate("0", 64)},
            SignalsFixture.signals(%{"sha256" => String.duplicate("z", 64)}),
            SignalsFixture.signals(%{"pdq" => [%{"hash" => "00", "quality" => 90}]}),
            SignalsFixture.signals(%{"pdq" => "not a list"})
          ] do
        assert Signals.parse(params) == {:error, :invalid_signals}
      end
    end
  end

  describe "HashList.match/1" do
    test "matches exact MD5 and SHA-256 digests" do
      md5 = :crypto.strong_rand_bytes(16)
      sha256 = :crypto.strong_rand_bytes(32)
      {:ok, 1} = HashList.put_entries([{"md5", md5}], "csam", "ncmec")
      {:ok, 1} = HashList.put_entries([{"sha256", sha256}], "malware", "malware_bazaar")

      assert %{signal_type: "md5", category: "csam", source: "ncmec"} =
               HashList.match(signals(%{"md5" => hex(md5)}))

      assert %{signal_type: "sha256", category: "malware"} =
               HashList.match(signals(%{"sha256" => hex(sha256)}))

      assert HashList.match(signals()) == nil
    end

    test "matches PDQ within a Hamming distance of 31" do
      pdq = :crypto.strong_rand_bytes(32)
      {:ok, 1} = HashList.put_entries([{"pdq", pdq}], "terror", "gifct")

      near = %{"hash" => hex(flip_bits(pdq, 31)), "quality" => 100}
      far = %{"hash" => hex(flip_bits(pdq, 32)), "quality" => 100}

      assert %{signal_type: "pdq", digest: ^pdq} = HashList.match(signals(%{"pdq" => [near]}))
      assert HashList.match(signals(%{"pdq" => [far]})) == nil
    end

    test "keeps the first source for duplicate hashes" do
      sha256 = :crypto.strong_rand_bytes(32)
      assert {:ok, 1} = HashList.put_entries([{"sha256", sha256}], "malware", "first")
      assert {:ok, 0} = HashList.put_entries([{"sha256", sha256}], "terror", "second")
      assert %{source: "first"} = HashList.match(signals(%{"sha256" => hex(sha256)}))
    end
  end

  test "MalwareBazaar exports import SHA-256 lines and skip comments" do
    sha256 = :crypto.strong_rand_bytes(32)

    body = """
    ################################################################
    # MalwareBazaar recent malware samples (SHA256 hashes)         #
    ################################################################
    #
    # sha256_hash
    #{hex(sha256)}
    """

    assert MalwareBazaar.store(body) == {:ok, 1}
    assert %{source: "malware_bazaar"} = HashList.match(signals(%{"sha256" => hex(sha256)}))
  end

  test "import_file reports the first invalid line" do
    path = Path.join(System.tmp_dir!(), "hashes-#{System.unique_integer([:positive])}.txt")
    File.write!(path, "# md5\n#{hex(:crypto.strong_rand_bytes(16))}\nnot-a-hash\n")
    on_exit(fn -> File.rm(path) end)

    assert HashList.import_file(path, "md5", "csam", "manual") == {:error, {:invalid_line, 3}}
    assert Repo.aggregate("hash_signals", :count) == 0
  end

  test "mix moderation.import loads a list the upload check then matches" do
    eicar = ~S|X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*|
    sha256 = :crypto.hash(:sha256, eicar)
    path = Path.join(System.tmp_dir!(), "eicar-#{System.unique_integer([:positive])}.txt")
    File.write!(path, "# eicar\n#{hex(sha256)}\n")
    on_exit(fn -> File.rm(path) end)

    Mix.shell(Mix.Shell.Process)
    on_exit(fn -> Mix.shell(Mix.Shell.IO) end)
    Mix.Tasks.Moderation.Import.run([path, "--type", "sha256", "--category", "malware"])

    assert_received {:mix_shell, :info, ["Imported 1 new sha256 hashes"]}

    assert hex(sha256) == "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"
    assert %{source: "manual"} = HashList.match(signals(%{"sha256" => hex(sha256)}))
  end

  describe "screen_upload/2" do
    test "discards clean signals" do
      assert Moderation.screen_upload(pending_file(), signals()) == :ok
      assert Repo.aggregate(Event, :count) == 0
    end

    test "records a match as evidence" do
      transfer = pending_file()
      md5 = :crypto.strong_rand_bytes(16)
      {:ok, 1} = HashList.put_entries([{"md5", md5}], "csam", "ncmec")

      assert {:blocked, %{category: "csam"}} =
               Moderation.screen_upload(transfer, signals(%{"md5" => hex(md5)}))

      assert [event] = Repo.all(Event)
      assert event.action == "blocked_upload"
      assert event.transfer_id == transfer.id
      assert event.device_id == transfer.sender_id
      assert event.digest == md5
    end
  end
end
