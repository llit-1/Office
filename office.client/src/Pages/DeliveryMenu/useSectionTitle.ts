import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";

export default function useSectionTitle(title: string, back: string) {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(titleSet({ title }));
    dispatch(pathSet({ path: back }));
    dispatch(visibleSet({ visible: true }));
  }, [dispatch, title, back]);
}
