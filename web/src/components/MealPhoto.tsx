"use client";

import { useEffect, useState } from "react";
import type { Meal } from "@/lib/types";
import { getPhoto, photoIdsOf } from "@/lib/photos";

/**
 * 从 IndexedDB 异步取照片并显示。
 *
 * 一条记录可能有两张照片：先拍了盖饭，又补拍了馄饨汤。
 * 列表里显示第一张，角上标"2 张"，点开可以挨着看。
 */
export default function MealPhoto({
  meal,
  className = "",
  alt = "这顿吃的",
  onOpen,
}: {
  meal: Meal;
  className?: string;
  alt?: string;
  /** 传出去的是全部照片和当前这张的下标 */
  onOpen?: (srcs: string[], index: number) => void;
}) {
  const [srcs, setSrcs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const ids = photoIdsOf(meal);

    (async () => {
      const list: string[] = [];
      // 最早那批记录的图直接存在记录里，先放进来
      if (meal.image) list.push(meal.image);
      for (const id of ids) {
        const d = await getPhoto(id);
        if (d) list.push(d);
      }
      if (!alive) return;
      setSrcs(list);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [meal]);

  if (!srcs.length) {
    return (
      <div
        className={`${
          loading
            ? "animate-pulse bg-black/[0.06]"
            : "flex items-center justify-center bg-black/[0.04] text-[11px] text-ink-300"
        } ${className}`}
      >
        {loading ? null : "没拍"}
      </div>
    );
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={srcs[0]} alt={alt} className="h-full w-full object-cover" />
  );

  const badge =
    srcs.length > 1 ? (
      <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
        {srcs.length} 张
      </span>
    ) : null;

  if (!onOpen) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {img}
        {badge}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(srcs, 0)}
      aria-label={srcs.length > 1 ? `看这 ${srcs.length} 张照片` : "看这张照片"}
      className={`relative overflow-hidden active:scale-95 ${className}`}
    >
      {img}
      {badge}
    </button>
  );
}
