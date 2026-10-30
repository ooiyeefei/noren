import { NOREN_PATH } from "@/components/map/map-helpers";

export function NorenTab({ story = false }: { story?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 32" width="20" height="24" className="shrink-0">
      <path
        d={NOREN_PATH}
        fill={story ? "#f2c14e" : "#23305c"}
        stroke={story ? "#23305c" : "#ffffff"}
        strokeWidth={story ? 2 : 1}
      />
    </svg>
  );
}
