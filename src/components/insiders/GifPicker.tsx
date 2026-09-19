import { useContext, useState } from "react";
import { Grid, SearchBar, SearchContext, SearchContextManager, SuggestionBar } from "@giphy/react-components";
import type { IGif } from "@giphy/js-types";
import { validGiphyUrl } from "@/services/insidersRules";

/** Giphy's published Web SDK demo key; override with VITE_GIPHY_API_KEY. */
const KEY = import.meta.env.VITE_GIPHY_API_KEY?.trim() || "sXpGFDGAd0syZp9YaS3szp2L42VIuHTz";

function gifUrl(gif: IGif) {
  const images = gif.images as { downsized?: { url?: string }; original?: { url?: string } };
  return images.downsized?.url || images.original?.url || "";
}

function PickerBody({ onPick }: { onPick: (url: string) => void }) {
  const { fetchGifs, searchKey } = useContext(SearchContext);
  return (
    <div className="insiders-gif-pop">
      <SearchBar placeholder="Search Giphy" />
      <SuggestionBar />
      <Grid
        key={searchKey}
        width={320}
        columns={3}
        gutter={4}
        borderRadius={0}
        fetchGifs={fetchGifs}
        noLink
        hideAttribution
        onGifClick={(gif, e) => {
          e.preventDefault();
          const url = gifUrl(gif);
          if (validGiphyUrl(url)) onPick(url);
        }}
      />
    </div>
  );
}

export function GifPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (value) {
    return (
      <div className="insiders-gif-picked">
        <img src={value} alt="" />
        <button type="button" className="insiders-quiet" onClick={() => onPick("")}>
          remove
        </button>
      </div>
    );
  }

  return (
    <div className="insiders-gif">
      <button type="button" className="insiders-quiet" onClick={() => setOpen((v) => !v)}>
        gif
      </button>
      {open ? (
        <SearchContextManager apiKey={KEY} theme={{ mode: "dark", searchbarHeight: 36 }} shouldDefaultToTrending>
          <PickerBody
            onPick={(url) => {
              onPick(url);
              setOpen(false);
            }}
          />
        </SearchContextManager>
      ) : null}
    </div>
  );
}
