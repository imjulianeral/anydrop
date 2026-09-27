defmodule Mix.Tasks.Moderation.Import do
  @shortdoc "Imports a hash list file for upload screening"

  @moduledoc """
  Imports one hex digest per line (the first CSV column). `#` lines are comments.

      mix moderation.import PATH --type sha256 --category malware --source manual

  `--type` is md5, sha256, or pdq. `--category` is csam, ncii, terror, or malware.
  """

  use Mix.Task

  alias Anyshare.Moderation.HashList

  @switches [type: :string, category: :string, source: :string]

  @impl true
  def run(args) do
    {options, paths} = OptionParser.parse!(args, strict: @switches)
    type = Keyword.get(options, :type, "sha256")
    category = Keyword.get(options, :category, "malware")
    source = Keyword.get(options, :source, "manual")

    unless type in HashList.signal_types() and category in HashList.categories() and
             length(paths) == 1 do
      Mix.raise("usage: mix moderation.import PATH --type TYPE --category CATEGORY")
    end

    Mix.Task.run("app.start")

    case HashList.import_file(hd(paths), type, category, source) do
      {:ok, count} -> Mix.shell().info("Imported #{count} new #{type} hashes")
      {:error, {:invalid_line, line}} -> Mix.raise("Invalid #{type} digest on line #{line}")
    end
  end
end
